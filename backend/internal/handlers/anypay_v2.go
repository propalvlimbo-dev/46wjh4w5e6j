package handlers

import (
	"context"
	"crypto/sha256"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

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
	PayID    json.RawMessage `json:"pay_id"`
	Status   string          `json:"status"`
	Amount   json.RawMessage `json:"amount"`
	Currency string          `json:"currency"`
	TransID  json.RawMessage `json:"transaction_id"`
}

type anypayStatusResult struct {
	Found         bool
	Status        string
	TransactionID string
	Amount        string
	Currency      string
}

func anypayAPIBase(cfg *config.Config) string {
	base := strings.TrimSpace(cfg.AnyPayAPIURL)
	if base == "" {
		base = "https://anypay.io/api"
	}
	return strings.TrimRight(base, "/")
}

// anypayPayStatus спрашивает новый API AnyPay о статусе платежа:
// GET {base}/payments/{API_ID}?project_id=&pay_id=&sign=
// sign = sha256("payments" + API_ID + project_id + API_KEY).
func anypayPayStatus(ctx context.Context, cfg *config.Config, payID string) (anypayStatusResult, error) {
	if cfg.AnyPayAPIID == "" || cfg.AnyPayAPIKey == "" || cfg.AnyPayMerchantID == "" {
		return anypayStatusResult{}, fmt.Errorf("anypay api credentials are not configured")
	}

	h := sha256.Sum256([]byte("payments" + cfg.AnyPayAPIID + cfg.AnyPayMerchantID + cfg.AnyPayAPIKey))
	sign := hex.EncodeToString(h[:])

	q := url.Values{}
	q.Set("project_id", cfg.AnyPayMerchantID)
	q.Set("pay_id", payID)
	q.Set("sign", sign)
	endpoint := fmt.Sprintf("%s/payments/%s?%s", anypayAPIBase(cfg), url.PathEscape(cfg.AnyPayAPIID), q.Encode())

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return anypayStatusResult{}, err
	}
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return anypayStatusResult{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return anypayStatusResult{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return anypayStatusResult{}, fmt.Errorf("anypay api status %d: %s", resp.StatusCode, string(body[:min(len(body), 300)]))
	}

	var parsed anypayResp
	if err := json.Unmarshal(body, &parsed); err != nil {
		return anypayStatusResult{}, fmt.Errorf("anypay api parse: %w (body: %s)", err, string(body[:min(len(body), 300)]))
	}
	if parsed.Error != nil {
		return anypayStatusResult{}, fmt.Errorf("anypay api error %s: %s", parsed.Error.Code, parsed.Error.Message)
	}
	if parsed.Result == nil || len(parsed.Result.Payments) == 0 {
		return anypayStatusResult{Found: false}, nil
	}

	for txID, p := range parsed.Result.Payments {
		// При фильтре pay_id AnyPay обычно возвращает один платеж, ключ карты — txid.
		// На всякий случай проверяем pay_id, но не ломаем старые/урезанные ответы.
		if rawString(p.PayID) != "" && rawString(p.PayID) != payID {
			continue
		}
		transactionID := rawString(p.TransID)
		if transactionID == "" {
			transactionID = txID
		}
		return anypayStatusResult{
			Found:         true,
			Status:        strings.ToLower(strings.TrimSpace(p.Status)),
			TransactionID: transactionID,
			Amount:        rawString(p.Amount),
			Currency:      strings.ToUpper(strings.TrimSpace(p.Currency)),
		}, nil
	}

	return anypayStatusResult{Found: false}, nil
}

var verifyLastStatus sync.Map

func logVerifyStatus(payID, anypayStatus string) {
	if anypayStatus == "" {
		anypayStatus = "not_found"
	}
	if prev, ok := verifyLastStatus.Load(payID); ok && prev == anypayStatus {
		return
	}
	verifyLastStatus.Store(payID, anypayStatus)
	fmt.Printf("verify: pay_id=%s anypay_status=%q at %s\n", payID, anypayStatus, time.Now().Format("15:04:05"))
}

func anypayPaidMatchesOrder(payID string, price int, paymentID string, ap anypayStatusResult) bool {
	if ap.Status != "paid" {
		return false
	}
	if ap.Amount != "" && !amountMatches(ap.Amount, price) {
		fmt.Println("!!! anypay paid amount mismatch: pay_id:", payID, "got:", ap.Amount, "expected:", price)
		return false
	}
	if ap.Currency != "" && ap.Currency != "RUB" {
		fmt.Println("!!! anypay paid currency mismatch: pay_id:", payID, "got:", ap.Currency, "expected: RUB")
		return false
	}
	if paymentID != "" && ap.TransactionID != "" && paymentID != ap.TransactionID {
		fmt.Println("!!! anypay transaction mismatch: pay_id:", payID, "stored:", paymentID, "api:", ap.TransactionID)
		return false
	}
	return true
}

// StartPendingSweeper добивает заказы, если вкладку закрыли или callback не дошел:
// pending старше 2 минут и младше 2 дней проверяет через AnyPay;
// paid повторно отправляет в плагин; expired/error старше часа помечает failed.
func StartPendingSweeper(cfg *config.Config) {
	go func() {
		time.Sleep(10 * time.Second)
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()

		for {
			sweepPendingPayments(cfg)
			<-ticker.C
		}
	}()
}

func sweepPendingPayments(cfg *config.Config) {
	ctx, cancel := context.WithTimeout(context.Background(), 55*time.Second)
	defer cancel()

	rows, err := db.Pool.Query(ctx, `
		SELECT id, anypay_pay_id::text, price, COALESCE(payment_id,''), status, created_at
		FROM orders
		WHERE anypay_pay_id IS NOT NULL
		  AND status IN ('pending','paid')
		  AND created_at > NOW() - INTERVAL '2 days'
		  AND (status='paid' OR created_at < NOW() - INTERVAL '2 minutes')
		ORDER BY created_at
		LIMIT 25`)
	if err != nil {
		fmt.Println("!!! sweeper query error:", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var orderID, payID, paymentID, status string
		var price int
		var createdAt time.Time
		if err := rows.Scan(&orderID, &payID, &price, &paymentID, &status, &createdAt); err != nil {
			fmt.Println("!!! sweeper scan error:", err)
			continue
		}

		if status == "paid" {
			fmt.Println("sweeper: retry issue paid order:", orderID, "pay_id:", payID)
			fulfillPendingOrder(cfg, orderID, "")
			continue
		}

		ap, err := anypayPayStatus(ctx, cfg, payID)
		if err != nil {
			fmt.Println("!!! sweeper anypay status error: pay_id:", payID, "err:", err)
			continue
		}
		logVerifyStatus(payID, ap.Status)
		if !ap.Found {
			continue
		}

		switch ap.Status {
		case "paid":
			if anypayPaidMatchesOrder(payID, price, paymentID, ap) {
				fmt.Println("sweeper: paid confirmed, issuing order:", orderID, "pay_id:", payID)
				fulfillPendingOrder(cfg, orderID, ap.TransactionID)
			}
		case "expired", "error":
			if createdAt.Before(time.Now().Add(-1 * time.Hour)) {
				if _, err := db.Pool.Exec(ctx, `UPDATE orders SET status='failed' WHERE id=$1 AND status='pending'`, orderID); err != nil {
					fmt.Println("!!! sweeper failed update error: order:", orderID, "err:", err)
				} else {
					fmt.Println("sweeper: pending order marked failed:", orderID, "pay_id:", payID, "anypay_status:", ap.Status)
				}
			}
		}
	}
	if err := rows.Err(); err != nil {
		fmt.Println("!!! sweeper rows error:", err)
	}
}
