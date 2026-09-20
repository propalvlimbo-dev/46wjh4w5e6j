package handlers

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"elytrix/internal/plugin"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func sha256hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// allowedAnyPayMethods — методы, которые принимает AnyPay (см. https://anypay.io/doc/sci/methods).
var allowedAnyPayMethods = map[string]bool{
	"sbp": true, "card": true, "ym": true, "sberbank": true, "vtb": true,
	"btc": true, "eth": true, "bch": true, "ltc": true, "dash": true,
	"zec": true, "doge": true, "usdt": true, "ton": true, "usdc": true,
}

// allowedCardCurrencies — валюты метода card (см. https://anypay.io/doc/api/create-payment).
var allowedCardCurrencies = map[string]bool{
	"RUB": true, "UAH": true, "UZS": true, "AZN": true,
	"AMD": true, "KGS": true, "TJS": true, "KZT": true,
}

// normalizeMethod приводит метод оплаты к нижнему регистру и проверяет его.
func normalizeMethod(m string) (string, error) {
	m = strings.ToLower(strings.TrimSpace(m))
	if m == "" {
		return "sbp", nil
	}
	if !allowedAnyPayMethods[m] {
		return "", fmt.Errorf("unknown method: %s", m)
	}
	return m, nil
}

// normalizeCardCurrency возвращает валюту оплаты картой (для method=card).
func normalizeCardCurrency(method, cur string) string {
	if method != "card" {
		return ""
	}
	cur = strings.ToUpper(strings.TrimSpace(cur))
	if cur == "" || !allowedCardCurrencies[cur] {
		return ""
	}
	return cur
}

// rawString приводит json.RawMessage (может прийти числом или строкой) к строке.
func rawString(r json.RawMessage) string {
	s := strings.TrimSpace(string(r))
	if s == "" || s == "null" {
		return ""
	}
	return strings.Trim(s, `"`)
}

// generateAnyPayPayID создаёт уникальный 15-значный номер платежа для AnyPay.
// ВАЖНО: он НЕ зависит от BIGSERIAL pay_num, чтобы при переносе/восстановлении БД
// (когда счётчик сбрасывается) новый заказ никогда не совпал с уже оплаченным
// платежом в AnyPay. Раньше здесь был pay_num — это и была уязвимость «донат без оплаты».
func generateAnyPayPayID() int64 {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// редкий запасной путь: время + случайность не даст коллизии с историей AnyPay
		return 100000000000000 + time.Now().UnixNano()%900000000000000
	}
	return 100000000000000 + int64(binary.LittleEndian.Uint64(b[:])%900000000000000)
}

// amountMatches проверяет, что сумма из колбэка совпадает с суммой заказа.
func amountMatches(amountStr string, price int) bool {
	f, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return false
	}
	return math.Abs(f-float64(price)) < 0.01
}

type anypayCreateResponse struct {
	Result *struct {
		TransactionID json.RawMessage `json:"transaction_id"`
		PayID         json.RawMessage `json:"pay_id"`
		Status        string          `json:"status"`
		PaymentURL    string          `json:"payment_url"`
		PaymentData   map[string]any  `json:"payment_data"`
	} `json:"result"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// anypayCreatePayment создаёт платёж через API AnyPay и возвращает ссылку на оплату.
// Формула подписи (см. https://anypay.io/doc/api/create-payment):
// sha256("create-payment" + API_ID + project_id + pay_id + amount + currency + desc + method + API_KEY)
func anypayCreatePayment(cfg *config.Config, payID, amount, currency, desc, email, method, methodCurrency string) (paymentURL, transactionID string, paymentData map[string]any, err error) {
	sign := sha256hex("create-payment" + cfg.AnyPayAPIID + cfg.AnyPayMerchantID + payID + amount + currency + desc + method + cfg.AnyPayAPIKey)

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fields := map[string]string{
		"project_id": cfg.AnyPayMerchantID,
		"pay_id":     payID,
		"amount":     amount,
		"currency":   currency,
		"desc":       desc,
		"email":      email,
		"method":     method,
	}
	if methodCurrency != "" {
		fields["method_currency"] = methodCurrency
	}
	for k, v := range fields {
		if err := w.WriteField(k, v); err != nil {
			return "", "", nil, err
		}
	}
	if err := w.WriteField("sign", sign); err != nil {
		return "", "", nil, err
	}
	if err := w.Close(); err != nil {
		return "", "", nil, err
	}

	req, err := http.NewRequest(http.MethodPost, anypayAPIBase(cfg)+"/create-payment/"+url.PathEscape(cfg.AnyPayAPIID), &buf)
	if err != nil {
		return "", "", nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", w.FormDataContentType())

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", nil, err
	}

	var parsed anypayCreateResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", "", nil, fmt.Errorf("anypay create-payment parse: %w (body: %s)", err, string(body))
	}
	if parsed.Error != nil {
		return "", "", nil, fmt.Errorf("anypay create-payment error %s: %s", parsed.Error.Code, parsed.Error.Message)
	}
	if parsed.Result == nil || parsed.Result.PaymentURL == "" {
		return "", "", nil, fmt.Errorf("anypay create-payment: no payment_url (body: %s)", string(body))
	}
	return parsed.Result.PaymentURL, rawString(parsed.Result.TransactionID), parsed.Result.PaymentData, nil
}

func CreatePayment(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Player         string `json:"player"`
			ProductID      int    `json:"product_id"`
			Promo          string `json:"promo"`
			Method         string `json:"method"`
			MethodCurrency string `json:"method_currency"`
			OptionID       int    `json:"option_id"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "bad body"})
		}

		method, merr := normalizeMethod(body.Method)
		if merr != nil {
			return c.Status(400).JSON(fiber.Map{"error": merr.Error()})
		}
		methodCurrency := normalizeCardCurrency(method, body.MethodCurrency)

		// Байпас (IP в whitelist / bypass-cookie / сессия админки) может покупать
		// и во время тех. работ — иначе админ не может ничего проверить.
		if !MaintenanceBypass(c, cfg) {
			var schedAt string
			db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_scheduled_at'`).Scan(&schedAt)
			if schedAt != "" {
				st, err := parseRFC3339(schedAt)
				if err == nil && time.Now().Add(3*time.Minute).After(st) && time.Now().Before(st) {
					return c.Status(400).JSON(fiber.Map{"error": "Дождитесь окончания технических работ"})
				}
			}

			var maintUntil string
			db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_until'`).Scan(&maintUntil)
			if maintUntil != "" {
				t, err := parseRFC3339(maintUntil)
				if err == nil && time.Now().Before(t) {
					return c.Status(400).JSON(fiber.Map{"error": "Дождитесь окончания технических работ"})
				}
			}
		}

		body.Player = strings.TrimSpace(body.Player)
		if len(body.Player) < 3 || len(body.Player) > 16 {
			return c.Status(400).JSON(fiber.Map{"error": "invalid name"})
		}

		var testMode string
		db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='test_mode'`).Scan(&testMode)
		if testMode != "true" {
			check, _, err := plugin.Request(cfg.PluginURL, cfg.PluginSecret, "/api/check-player", []byte(body.Player))
			if err != nil || check != "OK" {
				return c.Status(400).JSON(fiber.Map{"error": "Вы должны быть в игре для покупки"})
			}
		}

		ctx := context.Background()
		tx, err := db.Pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		defer tx.Rollback(ctx)

		var price int
		var productName string
		err = tx.QueryRow(ctx,
			`SELECT price, name FROM products WHERE id=$1 AND active=TRUE`, body.ProductID).
			Scan(&price, &productName)
		baseProductName := productName
		if err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "product not found"})
		}

		// Вариант оплаты («на неделю / на 30 дней / Новый год» — что угодно):
		// своя цена и длительность; команды подставляются на выдаче.
		optionLabel := ""
		optionID := 0
		if body.OptionID > 0 {
			err = tx.QueryRow(ctx,
				`SELECT id, label, price FROM product_options WHERE id=$1 AND product_id=$2 AND active=TRUE`,
				body.OptionID, body.ProductID).Scan(&optionID, &optionLabel, &price)
			if err != nil {
				return c.Status(400).JSON(fiber.Map{"error": "Вариант оплаты недоступен"})
			}
			productName = productName + " · " + optionLabel
		} else {
			var nOpts int
			tx.QueryRow(ctx, `SELECT COUNT(*) FROM product_options WHERE product_id=$1 AND active=TRUE`, body.ProductID).Scan(&nOpts)
			if nOpts > 0 {
				return c.Status(400).JSON(fiber.Map{"error": "Выберите вариант оплаты (на какой срок)"})
			}
		}

		promoApplied := ""
		if body.Promo != "" {
			code := strings.ToUpper(strings.TrimSpace(body.Promo))
			var pid, discount int
			err := tx.QueryRow(ctx,
				`SELECT id, discount FROM promocodes
				 WHERE code=$1 AND active=TRUE
				   AND (expires_at IS NULL OR expires_at > NOW())
				   AND (max_uses = 0 OR used < max_uses)
				   AND (product_id IS NULL OR product_id = $2)`,
				code, body.ProductID).Scan(&pid, &discount)
			if err == nil {
				price = price * (100 - discount) / 100
				if price < 1 {
					price = 1
				}
				promoApplied = code
			}
		}

		orderID := uuid.New().String()
		pUUID := offlineUUID(body.Player)

		// Уникальный номер платежа для AnyPay + повтор при редкой коллизии.
		// ON CONFLICT DO NOTHING (без аборта транзакции) — при совпадении
		// anypay_pay_id просто генерируем новый номер и пробуем снова.
		var anypayPayID int64
		inserted := false
		for attempt := 0; attempt < 5; attempt++ {
			anypayPayID = generateAnyPayPayID()
			res, err := tx.Exec(ctx,
				`INSERT INTO orders(id,player_name,player_uuid,product_id,product_name,price,status,promo_code,payment_method,anypay_pay_id,option_id,option_label)
				 VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,NULLIF($10,0),NULLIF($11,''))
				 ON CONFLICT (anypay_pay_id) WHERE anypay_pay_id IS NOT NULL DO NOTHING`,
				orderID, body.Player, pUUID, body.ProductID, baseProductName, price, promoApplied, method, anypayPayID, optionID, optionLabel)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			if res.RowsAffected() > 0 {
				inserted = true
				break
			}
		}
		if !inserted {
			return c.Status(500).JSON(fiber.Map{"error": "could not allocate pay id"})
		}
		if err := tx.Commit(ctx); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		amount := fmt.Sprintf("%d.00", price)
		currency := "RUB"
		desc := fmt.Sprintf("%s - %s", productName, body.Player)
		if len(desc) > 150 {
			desc = desc[:150]
		}
		payIDStr := strconv.FormatInt(anypayPayID, 10)

		var (
			paymentURL    string
			transactionID string
			paymentData   map[string]any
			viaAPI        bool
		)

		// Ник игрока — безопасные символы [A-Za-z0-9_], поэтому из него можно
		// собрать валидный email для обязательного поля API create-payment.
		email := strings.ToLower(body.Player) + "@elytrix.pw"

		// Предпочтительный путь — API create-payment: он отдаёт payment_url и
		// реквизиты (для СБП/крипты), на основе которых фронт рисует QR-код.
		if cfg.AnyPayAPIID != "" && cfg.AnyPayAPIKey != "" {
			if u, txID, pd, aerr := anypayCreatePayment(cfg, payIDStr, amount, currency, desc, email, method, methodCurrency); aerr == nil {
				paymentURL, transactionID, paymentData, viaAPI = u, txID, pd, true
				if txID != "" {
					db.Pool.Exec(ctx, `UPDATE orders SET payment_id=$1 WHERE id=$2`, txID, orderID)
				}
				fmt.Println("=== AnyPay API create-payment ===")
				fmt.Println("method:", method, "method_currency:", methodCurrency, "transaction_id:", txID, "url:", u)
				fmt.Println("==================================")
			} else {
				fmt.Println("!!! anypay create-payment API failed, falling back to SCI:", aerr)
			}
		}

		// Запасной путь — SCI-форма с заранее выбранным методом (см. https://anypay.io/doc/sci).
		// Подпись: sha256(merchant_id:pay_id:amount:currency:desc:success_url:fail_url:secret),
		// success_url и fail_url — пустые (переопределение запрещено), параметр method в подпись не входит.
		if !viaAPI {
			signStr := cfg.AnyPayMerchantID + ":" + payIDStr + ":" + amount + ":" + currency + ":" +
				desc + ":::" + cfg.AnyPayProjectSecret
			sign := sha256hex(signStr)

			params := url.Values{}
			params.Set("merchant_id", cfg.AnyPayMerchantID)
			params.Set("amount", amount)
			params.Set("currency", currency)
			params.Set("pay_id", payIDStr)
			params.Set("desc", desc)
			params.Set("method", method)
			params.Set("sign", sign)

			paymentURL = "https://anypay.io/merchant?" + params.Encode()

			fmt.Println("=== AnyPay SCI ===")
			fmt.Println("URL:", paymentURL)
			fmt.Println("==================")
		}

		return c.JSON(fiber.Map{
			"ok":             true,
			"url":            paymentURL,
			"order":          orderID,
			"pay_id":         payIDStr,
			"promo":          promoApplied,
			"amount":         price,
			"method":         method,
			"transaction_id": transactionID,
			"payment_data":   paymentData,
		})
	}
}


func validMinecraftName(name string) bool {
	if len(name) < 3 || len(name) > 16 {
		return false
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

func coinsRate(cfg *config.Config) int {
	rate, err := strconv.Atoi(strings.TrimSpace(cfg.CoinsRate))
	if err != nil || rate <= 0 {
		return 10
	}
	return rate
}

func buildCoinsCommand(cfg *config.Config, player string, coins int) string {
	tpl := strings.TrimSpace(cfg.CoinsCommand)
	if tpl == "" {
		tpl = "coins give %player% %coins%\nfmda send %player% %coin%"
	}
	tpl = strings.ReplaceAll(tpl, "\\n", "\n")
	coinText := fmt.Sprintf("%d Коинов", coins)
	repl := map[string]string{
		"%player%":     player,
		"{player}":     player,
		"%coins%":      strconv.Itoa(coins),
		"{coins}":      strconv.Itoa(coins),
		"%amount%":     strconv.Itoa(coins),
		"{amount}":     strconv.Itoa(coins),
		"%coin%":       coinText,
		"{coin}":       coinText,
		"%coins_text%": coinText,
		"{coins_text}": coinText,
	}
	for k, v := range repl {
		tpl = strings.ReplaceAll(tpl, k, v)
	}
	if !strings.Contains(strings.ToLower(tpl), "fmda send") {
		tpl = strings.TrimRight(tpl, "\r\n")
		if tpl != "" {
			tpl += "\n"
		}
		tpl += fmt.Sprintf("fmda send %s %s", player, coinText)
	}
	return tpl
}

func CreateCoinsPayment(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Player         string `json:"player"`
			Amount         int    `json:"amount"`
			Method         string `json:"method"`
			MethodCurrency string `json:"method_currency"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "bad body"})
		}

		method, merr := normalizeMethod(body.Method)
		if merr != nil {
			return c.Status(400).JSON(fiber.Map{"error": merr.Error()})
		}
		methodCurrency := normalizeCardCurrency(method, body.MethodCurrency)

		body.Player = strings.TrimSpace(body.Player)
		if !validMinecraftName(body.Player) {
			return c.Status(400).JSON(fiber.Map{"error": "invalid name"})
		}
		if body.Amount < 1 || body.Amount > 6000 {
			return c.Status(400).JSON(fiber.Map{"error": "Сумма должна быть от 1 до 6000 ₽"})
		}

		if !MaintenanceBypass(c, cfg) {
			var schedAt string
			db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_scheduled_at'`).Scan(&schedAt)
			if schedAt != "" {
				st, err := parseRFC3339(schedAt)
				if err == nil && time.Now().Add(3*time.Minute).After(st) && time.Now().Before(st) {
					return c.Status(400).JSON(fiber.Map{"error": "Дождитесь окончания технических работ"})
				}
			}

			var maintUntil string
			db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_until'`).Scan(&maintUntil)
			if maintUntil != "" {
				t, err := parseRFC3339(maintUntil)
				if err == nil && time.Now().Before(t) {
					return c.Status(400).JSON(fiber.Map{"error": "Дождитесь окончания технических работ"})
				}
			}
		}

		var testMode string
		db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='test_mode'`).Scan(&testMode)
		if testMode != "true" {
			check, _, err := plugin.Request(cfg.PluginURL, cfg.PluginSecret, "/api/check-player", []byte(body.Player))
			if err != nil || check != "OK" {
				return c.Status(400).JSON(fiber.Map{"error": "Вы должны быть в игре для покупки"})
			}
		}

		price := body.Amount
		coins := price * coinsRate(cfg)
		productName := fmt.Sprintf("Коины · %d", coins)
		commands := buildCoinsCommand(cfg, body.Player, coins)

		ctx := context.Background()
		tx, err := db.Pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}
		defer tx.Rollback(ctx)

		orderID := uuid.New().String()
		pUUID := offlineUUID(body.Player)
		var anypayPayID int64
		inserted := false
		for attempt := 0; attempt < 5; attempt++ {
			anypayPayID = generateAnyPayPayID()
			res, err := tx.Exec(ctx,
				`INSERT INTO orders(id,player_name,player_uuid,product_id,product_name,price,status,payment_method,anypay_pay_id,commands_override,coins_amount)
				 VALUES($1,$2,$3,NULL,$4,$5,'pending',$6,$7,$8,$9)
				 ON CONFLICT (anypay_pay_id) WHERE anypay_pay_id IS NOT NULL DO NOTHING`,
				orderID, body.Player, pUUID, productName, price, method, anypayPayID, commands, coins)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{"error": err.Error()})
			}
			if res.RowsAffected() > 0 {
				inserted = true
				break
			}
		}
		if !inserted {
			return c.Status(500).JSON(fiber.Map{"error": "could not allocate pay id"})
		}
		if err := tx.Commit(ctx); err != nil {
			return c.Status(500).JSON(fiber.Map{"error": err.Error()})
		}

		amount := fmt.Sprintf("%d.00", price)
		currency := "RUB"
		desc := fmt.Sprintf("%d коинов - %s", coins, body.Player)
		if len(desc) > 150 {
			desc = desc[:150]
		}
		payIDStr := strconv.FormatInt(anypayPayID, 10)

		var (
			paymentURL    string
			transactionID string
			paymentData   map[string]any
			viaAPI        bool
		)

		email := strings.ToLower(body.Player) + "@elytrix.pw"
		if cfg.AnyPayAPIID != "" && cfg.AnyPayAPIKey != "" {
			if u, txID, pd, aerr := anypayCreatePayment(cfg, payIDStr, amount, currency, desc, email, method, methodCurrency); aerr == nil {
				paymentURL, transactionID, paymentData, viaAPI = u, txID, pd, true
				if txID != "" {
					db.Pool.Exec(ctx, `UPDATE orders SET payment_id=$1 WHERE id=$2`, txID, orderID)
				}
				fmt.Println("=== AnyPay API create-payment ===")
				fmt.Println("method:", method, "method_currency:", methodCurrency, "transaction_id:", txID, "url:", u)
				fmt.Println("==================================")
			} else {
				fmt.Println("!!! anypay create-payment API failed, falling back to SCI:", aerr)
			}
		}

		if !viaAPI {
			signStr := cfg.AnyPayMerchantID + ":" + payIDStr + ":" + amount + ":" + currency + ":" +
				desc + ":::" + cfg.AnyPayProjectSecret
			sign := sha256hex(signStr)

			params := url.Values{}
			params.Set("merchant_id", cfg.AnyPayMerchantID)
			params.Set("amount", amount)
			params.Set("currency", currency)
			params.Set("pay_id", payIDStr)
			params.Set("desc", desc)
			params.Set("method", method)
			params.Set("sign", sign)

			paymentURL = "https://anypay.io/merchant?" + params.Encode()
			fmt.Println("=== AnyPay SCI ===")
			fmt.Println("URL:", paymentURL)
			fmt.Println("==================")
		}

		return c.JSON(fiber.Map{
			"ok":             true,
			"url":            paymentURL,
			"order":          orderID,
			"pay_id":         payIDStr,
			"amount":         price,
			"coins":          coins,
			"method":         method,
			"transaction_id": transactionID,
			"payment_data":   paymentData,
		})
	}
}

func productOptionColumnExists(ctx context.Context, tx pgx.Tx, column string) bool {
	var ok bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = current_schema()
			  AND table_name = 'product_options'
			  AND column_name = $1
		)`, column).Scan(&ok)
	if err != nil {
		fmt.Println("!!! product_options column check failed:", column, "err:", err)
		return false
	}
	return ok
}

func productOptionIntExpr(ctx context.Context, tx pgx.Tx, columns []string, fallback string) string {
	for _, col := range columns {
		if productOptionColumnExists(ctx, tx, col) {
			return "COALESCE(po." + col + ",0)"
		}
	}
	return fallback
}

func productOptionTextExpr(ctx context.Context, tx pgx.Tx, columns []string, fallback string) string {
	for _, col := range columns {
		if productOptionColumnExists(ctx, tx, col) {
			return "COALESCE(po." + col + ",'')"
		}
	}
	return fallback
}

func productOptionDurationExprs(ctx context.Context, tx pgx.Tx) (daysExpr, hoursExpr, durExpr string) {
	return productOptionIntExpr(ctx, tx, []string{"days"}, "0"),
		productOptionIntExpr(ctx, tx, []string{"duration_hours", "hours"}, "0"),
		productOptionTextExpr(ctx, tx, []string{"dur"}, "''")
}

// fulfillPendingOrder переводит pending-заказ в paid и пытается выдать награду.
// Идемпотентна: pending -> paid -> issued, paid можно вызывать повторно до выдачи,
// issued считается успешным no-op. FOR UPDATE держим до ответа плагина, чтобы не
// отправить одну покупку дважды при гонке callback/verify/sweeper.
func fulfillPendingOrder(cfg *config.Config, orderID, transactionID string) bool {
	ctx := context.Background()
	tx, err := db.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		fmt.Println("!!! fulfill begin tx failed: order:", orderID, "err:", err)
		return false
	}
	defer tx.Rollback(ctx)

	daysExpr, hoursExpr, durExpr := productOptionDurationExprs(ctx, tx)

	var currentStatus, playerName, commands, promoCode string
	var optDays, optHours int
	var optDur string
	query := `SELECT o.status, o.player_name, COALESCE(NULLIF(o.commands_override,''), NULLIF(po.commands,''), p.commands, ''), o.promo_code,
		        ` + daysExpr + `, ` + hoursExpr + `, ` + durExpr + `
		 FROM orders o
		 LEFT JOIN products p ON p.id=o.product_id
		 LEFT JOIN product_options po ON po.id=o.option_id
		 WHERE o.id=$1 FOR UPDATE OF o`
	err = tx.QueryRow(ctx, query, orderID).Scan(&currentStatus, &playerName, &commands, &promoCode, &optDays, &optHours, &optDur)
	if err != nil {
		fmt.Println("!!! fulfill order load failed: order:", orderID, "err:", err)
		return false
	}

	if currentStatus == "issued" {
		return true
	}
	if currentStatus != "pending" && currentStatus != "paid" {
		fmt.Println("!!! fulfill rejected by status: order:", orderID, "status:", currentStatus)
		return false
	}

	if currentStatus == "pending" {
		if transactionID != "" {
			if _, err := tx.Exec(ctx,
				`UPDATE orders SET status='paid', paid_at=NOW(), payment_id=$2 WHERE id=$1`, orderID, transactionID); err != nil {
				fmt.Println("!!! fulfill mark paid failed: order:", orderID, "err:", err)
				return false
			}
		} else {
			if _, err := tx.Exec(ctx,
				`UPDATE orders SET status='paid', paid_at=NOW() WHERE id=$1`, orderID); err != nil {
				fmt.Println("!!! fulfill mark paid failed: order:", orderID, "err:", err)
				return false
			}
		}

		if promoCode != "" {
			if _, err := tx.Exec(ctx, `UPDATE promocodes SET used=used+1 WHERE code=$1`, promoCode); err != nil {
				fmt.Println("!!! fulfill promo increment failed: order:", orderID, "promo:", promoCode, "err:", err)
			}
		}
	} else if transactionID != "" {
		if _, err := tx.Exec(ctx,
			`UPDATE orders SET payment_id=$2 WHERE id=$1 AND COALESCE(payment_id,'')=''`, orderID, transactionID); err != nil {
			fmt.Println("!!! fulfill payment_id update failed: order:", orderID, "err:", err)
			return false
		}
	}

	// плейсхолдеры длительности варианта: %days%, %hours% и %dur% (готовый
	// формат LuckPerms: 30d / 1d12h / 168h — админ вводит срок текстом)
	if strings.Contains(commands, "%days%") {
		commands = strings.ReplaceAll(commands, "%days%", strconv.Itoa(optDays))
	}
	if strings.Contains(commands, "%hours%") {
		commands = strings.ReplaceAll(commands, "%hours%", strconv.Itoa(optHours))
	}
	if strings.Contains(commands, "%dur%") {
		commands = strings.ReplaceAll(commands, "%dur%", optDur)
	}

	_, pStatus, perr := plugin.RequestJSON(cfg.PluginURL, cfg.PluginSecret, "/api/complete-order",
		map[string]string{
			"id":       orderID,
			"player":   playerName,
			"commands": commands,
		})
	if perr != nil || pStatus != 200 {
		fmt.Println("!!! plugin issue failed: order:", orderID, "status:", pStatus, "err:", perr)
		if err := tx.Commit(ctx); err != nil {
			fmt.Println("!!! fulfill commit paid-after-plugin-fail failed: order:", orderID, "err:", err)
			return false
		}
		return true
	}

	res, err := tx.Exec(ctx, `UPDATE orders SET status='issued', issued_at=NOW() WHERE id=$1 AND status='paid'`, orderID)
	if err != nil {
		fmt.Println("!!! fulfill mark issued failed: order:", orderID, "err:", err)
		return false
	}
	if res.RowsAffected() == 0 {
		fmt.Println("!!! fulfill mark issued skipped: order:", orderID, "status changed before update")
		return false
	}
	if err := tx.Commit(ctx); err != nil {
		fmt.Println("!!! fulfill commit failed: order:", orderID, "err:", err)
		return false
	}
	return true
}

func PaymentCallback(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		q := func(k string) string {
			v := c.Query(k)
			if v == "" {
				v = c.FormValue(k)
			}
			return v
		}

		merchantID := q("merchant_id")
		amount := q("amount")
		payID := q("pay_id")
		transactionID := q("transaction_id")
		currency := q("currency")
		if currency == "" {
			currency = "RUB"
		}
		status := q("status")
		if status == "" {
			status = "paid"
		}
		sign := q("sign")

		fmt.Println("=== AnyPay callback ===")
		fmt.Println("merchant_id:", merchantID, "amount:", amount, "pay_id:", payID, "currency:", currency, "status:", status, "sign:", sign)
		fmt.Println("=======================")

		if merchantID == "" || amount == "" || payID == "" || sign == "" {
			return c.Status(400).SendString("bad params")
		}
		if merchantID != cfg.AnyPayMerchantID {
			return c.Status(403).SendString("wrong merchant")
		}

		// Официальная формула SHA256: currency:amount:pay_id:merchant_id:status:secret
		expected := sha256hex(currency + ":" + amount + ":" + payID + ":" + merchantID + ":" + status + ":" + cfg.AnyPayProjectSecret)
		if !strings.EqualFold(expected, sign) {
			fmt.Println("!!! bad sign. expected:", expected, "got:", sign)
			return c.Status(403).SendString("bad sign")
		}

		if status != "paid" {
			fmt.Println("callback status is not paid:", status)
			return c.SendString("OK")
		}

		ctx := context.Background()

		// Ищем заказ по уникальному номеру платежа AnyPay (anypay_pay_id).
		var orderID, currentStatus string
		var price int
		err := db.Pool.QueryRow(ctx,
			`SELECT id, status, price FROM orders WHERE anypay_pay_id::text = $1`, payID).
			Scan(&orderID, &currentStatus, &price)
		if err != nil {
			fmt.Println("!!! callback: order not found for pay_id:", payID)
			return c.Status(404).SendString("order not found")
		}

		if currentStatus == "issued" {
			return c.SendString("OK")
		}

		// Сверяем сумму (доки AnyPay требуют проверять amount с оригиналом).
		if !amountMatches(amount, price) {
			fmt.Println("!!! callback: amount mismatch. got:", amount, "expected:", price)
			return c.Status(403).SendString("bad amount")
		}

		// API-проверка только для лога: подпись callback + совпавшая сумма уже достаточны,
		// поэтому AnyPay API не должен блокировать выдачу.
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			ap, err := anypayPayStatus(ctx, cfg, payID)
			if err != nil {
				fmt.Println("!!! callback anypay best-effort status failed: pay_id:", payID, "err:", err)
				return
			}
			fmt.Println("callback anypay best-effort: pay_id:", payID, "status:", ap.Status, "tx:", ap.TransactionID)
		}()

		fulfillPendingOrder(cfg, orderID, transactionID)
		return c.SendString("OK")
	}
}

func PaymentStatus(c *fiber.Ctx) error {
	orderID := c.Query("order")
	payID := c.Query("pay_id")
	if orderID == "" && payID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "no order"})
	}
	var status, playerName, productName string
	var price int
	var err error
	if orderID != "" {
		err = db.Pool.QueryRow(context.Background(),
			`SELECT o.status, o.player_name, o.price, COALESCE(NULLIF(o.product_name,''), p.name, 'Товар удалён')
			 FROM orders o LEFT JOIN products p ON p.id=o.product_id
			 WHERE o.id=$1`, orderID).Scan(&status, &playerName, &price, &productName)
	} else {
		err = db.Pool.QueryRow(context.Background(),
			`SELECT o.status, o.player_name, o.price, COALESCE(NULLIF(o.product_name,''), p.name, 'Товар удалён')
			 FROM orders o LEFT JOIN products p ON p.id=o.product_id
			 WHERE o.anypay_pay_id::text=$1`, payID).Scan(&status, &playerName, &price, &productName)
	}
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "not found"})
	}
	return c.JSON(fiber.Map{
		"status":  status,
		"player":  playerName,
		"product": productName,
		"price":   price,
	})
}
