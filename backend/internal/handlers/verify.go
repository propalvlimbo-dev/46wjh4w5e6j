package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// VerifyPayment — активная проверка платежа через API AnyPay.
// БЕЗОПАСНО: заказ выдаётся только если платёж, созданный НАМИ для этого заказа
// (проверяем transaction_id, сохранённый при создании), стал "paid".
// Простое совпадение pay_id больше не является поводом для выдачи — это
// закрывает уязвимость с переиспользованием pay_id после сброса базы.
func VerifyPayment(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		payID := strings.TrimSpace(c.Query("pay_id"))
		if payID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "no pay_id"})
		}

		orderID, status, player, product, price, paymentID, ok := orderByAnyPayID(payID)
		if !ok {
			return c.Status(404).JSON(fiber.Map{"error": "not found"})
		}

		// Только pending-заказы и только те, для которых мы сами создали платёж
		// через API (знаем его transaction_id). Для SCI-заказов (payment_id пустой)
		// автопроверку не делаем — их проводит только колбэк с валидной подписью.
		if status == "pending" && paymentID != "" && cfg.AnyPayAPIID != "" && cfg.AnyPayAPIKey != "" {
			apStatus, apTxID := queryAnyPayStatus(cfg, payID)
			logVerifyStatus(payID, apStatus)
			if apStatus == "paid" && apTxID != "" && apTxID == paymentID {
				fmt.Println("=== verify: paid confirmed via AnyPay API, issuing order:", orderID)
				if fulfillPendingOrder(cfg, orderID, "") {
					orderID, status, player, product, price, paymentID, ok = orderByAnyPayID(payID)
					if !ok {
						return c.Status(404).JSON(fiber.Map{"error": "not found"})
					}
				}
			}
		}

		return c.JSON(fiber.Map{
			"status":  status,
			"player":  player,
			"product": product,
			"price":   price,
		})
	}
}

// orderByAnyPayID — текущее состояние заказа по уникальному номеру платежа AnyPay.
func orderByAnyPayID(payID string) (orderID, status, player, product string, price int, paymentID string, ok bool) {
	err := db.Pool.QueryRow(context.Background(),
		`SELECT o.id, o.status, o.player_name, o.price, p.name, COALESCE(o.payment_id,'')
		 FROM orders o JOIN products p ON p.id=o.product_id
		 WHERE o.anypay_pay_id::text=$1`, payID).
		Scan(&orderID, &status, &player, &price, &product, &paymentID)
	return orderID, status, player, product, price, paymentID, err == nil
}

type anypayResp struct {
	Result *struct {
		Total    int                      `json:"total"`
		Payments map[string]anypayPayment `json:"payments"`
	} `json:"result"`
	Error *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type anypayPayment struct {
	PayID   json.RawMessage `json:"pay_id"` // может прийти и числом, и строкой
	Status  string          `json:"status"`
	Amount  json.RawMessage `json:"amount"`
	Currency string         `json:"currency"`
	TransID json.RawMessage `json:"transaction_id"`
}

func rawEquals(r json.RawMessage, s string) bool {
	return strings.Trim(string(r), `"`) == s
}

// verifyLastStatus хранит последний увиденный статус платежа для каждого pay_id,
// чтобы не спамить лог на каждый опрос (опрос идёт каждые 3 секунды).
var verifyLastStatus sync.Map

// logVerifyStatus логирует статус платежа в AnyPay только при его изменении.
func logVerifyStatus(payID, anypayStatus string) {
	if prev, ok := verifyLastStatus.Load(payID); ok && prev == anypayStatus {
		return
	}
	verifyLastStatus.Store(payID, anypayStatus)
	fmt.Printf("verify: pay_id=%s anypay_status=%q at %s\n", payID, anypayStatus, time.Now().Format("15:04:05"))
}

// queryAnyPayStatus — спрашивает у AnyPay статус конкретного платежа.
// Возвращает (статус, transaction_id). Формула подписи (докам AnyPay):
// sha256('payments' + API_ID + project_id + API_KEY)
func queryAnyPayStatus(cfg *config.Config, payID string) (status, transactionID string) {
	h := sha256.Sum256([]byte("payments" + cfg.AnyPayAPIID + cfg.AnyPayMerchantID + cfg.AnyPayAPIKey))
	sign := hex.EncodeToString(h[:])

	url := fmt.Sprintf("https://anypay.io/api/payments/%s?project_id=%s&pay_id=%s&sign=%s",
		cfg.AnyPayAPIID, cfg.AnyPayMerchantID, payID, sign)

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		fmt.Println("!!! anypay api error:", err)
		return "", ""
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", ""
	}

	var parsed anypayResp
	if err := json.Unmarshal(body, &parsed); err != nil {
		fmt.Println("!!! anypay api parse:", err, "body:", string(body[:min(len(body), 200)]))
		return "", ""
	}
	if parsed.Error != nil {
		fmt.Println("!!! anypay api error", parsed.Error.Code+":", parsed.Error.Message)
		return "", ""
	}
	if parsed.Result == nil {
		return "", ""
	}
	for _, p := range parsed.Result.Payments {
		if rawEquals(p.PayID, payID) {
			return p.Status, rawString(p.TransID)
		}
	}
	return "", ""
}
