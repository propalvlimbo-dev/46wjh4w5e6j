package handlers

import (
	"context"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"elytrix/internal/plugin"
	"elytrix/internal/redis"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
)

type topDonator struct {
	Name   string `json:"name"`
	Amount int    `json:"amount"` // сумма всех оплаченных заказов, ₽
	Orders int    `json:"orders"`
}

type topPlayer struct {
	Name    string `json:"name"`
	Seconds int64  `json:"seconds"` // наиграно на сервере
}

type topClan struct {
	Name         string  `json:"name"`
	Owner        string  `json:"owner"`
	Exp          float64 `json:"exp"`
	Level        int     `json:"level"`
	MembersCount int     `json:"members_count"`
}

type topPayload struct {
	Donators   []topDonator `json:"donators"`
	Players    []topPlayer  `json:"players"`
	PlayersOK  bool         `json:"players_ok"` // плагин был доступен
	Clans      []topClan    `json:"clans"`
	ClansOK    bool         `json:"clans_ok"` // ElytrixClans export был доступен
	ServerTime string       `json:"server_time"`
}

const topCacheKey = "cache:top"
const topCacheTTL = 30 * time.Second

// GetTop — топы сервера для сайта:
//   - «Топ донатеров»: SUM(price) по оплаченным заказам из PostgreSQL (магазина);
//   - «Топ активных»: vanilla playtime из ElytrixSite (эндпоинт /api/leaderboard-playtime);
//   - «Топы кланов»: опыт клана из ElytrixClans export через ElytrixSite (/api/clans/top).
//
// Ответ кэшируется в Redis на 5 минут (toп не должен долбить БД на каждый хит).
func GetTop(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx := context.Background()
		force := c.Query("refresh") == "1"

		if !force && redis.Client != nil {
			if cached, err := redis.Client.Get(ctx, topCacheKey).Result(); err == nil {
				var p topPayload
				if json.Unmarshal([]byte(cached), &p) == nil {
					return c.JSON(p)
				}
			}
		}

		payload := topPayload{
			Donators:   []topDonator{},
			Players:    []topPlayer{},
			Clans:      []topClan{},
			ServerTime: time.Now().UTC().Format(time.RFC3339),
		}

		// ——— Топ донатеров (донат через сайт) ———
		rows, err := db.Pool.Query(ctx,
			`SELECT player_name, COALESCE(SUM(price),0)::int, COUNT(*)
			 FROM orders
			 WHERE status IN ('paid','issued')
			 GROUP BY player_name
			 ORDER BY SUM(price) DESC, MAX(created_at) DESC
			 LIMIT 10`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var d topDonator
				rows.Scan(&d.Name, &d.Amount, &d.Orders)
				payload.Donators = append(payload.Donators, d)
			}
		}

		// ——— Топ активных игроков (vanilla stats сервера, фильтр групп в ElytrixSite) ———
		if res, status, perr := plugin.RequestJSON(cfg.PluginURL, cfg.PluginSecret, "/api/leaderboard-playtime", map[string]string{}); perr == nil && status == 200 {
			var list []topPlayer
			if json.Unmarshal([]byte(res), &list) == nil {
				payload.Players = list
				payload.PlayersOK = true
			}
		}

		// ——— Топ кланов (считаем только опыт клана) ———
		if res, status, perr := plugin.RequestJSON(cfg.PluginURL, cfg.PluginSecret, "/api/clans/top", map[string]string{}); perr == nil && status == 200 {
			var parsed struct {
				Clans []topClan `json:"clans"`
			}
			if json.Unmarshal([]byte(res), &parsed) == nil {
				payload.Clans = parsed.Clans
				payload.ClansOK = true
			}
		}

		if redis.Client != nil {
			if b, err := json.Marshal(payload); err == nil {
				redis.Client.Set(ctx, topCacheKey, b, topCacheTTL)
			}
		}
		return c.JSON(payload)
	}
}
