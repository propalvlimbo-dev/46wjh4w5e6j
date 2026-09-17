package handlers

import (
	"context"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"strings"
	"time"
)

// VerifyPayment активно проверяет платеж через новый API AnyPay.
// pending -> paid -> issued; paid можно повторно довыдать, если плагин был офлайн.
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

		switch status {
		case "pending":
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			ap, err := anypayPayStatus(ctx, cfg, payID)
			cancel()
			if err != nil {
				fmt.Println("!!! verify anypay status failed: pay_id:", payID, "err:", err)
			} else {
				logVerifyStatus(payID, ap.Status)
				if ap.Found && anypayPaidMatchesOrder(payID, price, paymentID, ap) {
					fmt.Println("verify: paid confirmed, issuing order:", orderID, "pay_id:", payID)
					fulfillPendingOrder(cfg, orderID, ap.TransactionID)
					orderID, status, player, product, price, paymentID, ok = orderByAnyPayID(payID)
					if !ok {
						return c.Status(404).JSON(fiber.Map{"error": "not found"})
					}
				}
			}
		case "paid":
			fmt.Println("verify: retry issue paid order:", orderID, "pay_id:", payID)
			fulfillPendingOrder(cfg, orderID, "")
			orderID, status, player, product, price, paymentID, ok = orderByAnyPayID(payID)
			if !ok {
				return c.Status(404).JSON(fiber.Map{"error": "not found"})
			}
		}

		_ = orderID
		_ = paymentID
		return c.JSON(fiber.Map{
			"status":  status,
			"player":  player,
			"product": product,
			"price":   price,
		})
	}
}

// orderByAnyPayID возвращает текущее состояние заказа по уникальному номеру платежа AnyPay.
func orderByAnyPayID(payID string) (orderID, status, player, product string, price int, paymentID string, ok bool) {
	err := db.Pool.QueryRow(context.Background(),
		`SELECT o.id, o.status, o.player_name,
		        COALESCE(NULLIF(o.product_name,''), p.name, 'Товар удалён'),
		        o.price, COALESCE(o.payment_id,'')
		 FROM orders o
		 LEFT JOIN products p ON p.id=o.product_id
		 WHERE o.anypay_pay_id::text=$1`, payID).
		Scan(&orderID, &status, &player, &product, &price, &paymentID)
	return orderID, status, player, product, price, paymentID, err == nil
}
