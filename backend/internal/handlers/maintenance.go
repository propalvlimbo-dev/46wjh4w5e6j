package handlers

import (
	"context"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"elytrix/internal/middleware"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// BypassCookie — когда IP из whitelist попадается хотя бы раз, браузеру
// выдаётся эта cookie (7 дней). Дальше байпас работает даже если IP сменился
// (мобильный интернет, роуминг) или Next.js потерял заголовок X-Real-IP.
const BypassCookie = "elytrix_bypass"

// normalizeIP — приводит IP к сравнимому виду: нижний регистр, без IPv4-mapped
// IPv6-префикса "::ffff:", без zone-индекса "%eth0".
func normalizeIP(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return ""
	}
	s = strings.TrimPrefix(s, "::ffff:")
	if i := strings.IndexByte(s, '%'); i >= 0 {
		s = s[:i]
	}
	return s
}

// clientIPs — все IPs, которые мы видим для запроса. Запрос идёт
// браузер → Nginx → Next.js (rewrite) → Go, поэтому заголовки может терять
// любой из слоёв — проверяем сразу все источники: X-Forwarded-For (весь цепочкой),
// X-Real-IP, CF-Connecting-IP и прямое соединение.
func clientIPs(c *fiber.Ctx) []string {
	var out []string
	seen := map[string]bool{}
	add := func(s string) {
		s = normalizeIP(s)
		if s != "" && !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, part := range strings.Split(c.Get("X-Forwarded-For"), ",") {
		add(part)
	}
	add(c.Get("X-Real-IP"))
	add(c.Get("CF-Connecting-IP"))
	add(c.IP())
	return out
}

// allowedIPs — список IP из настроек whitelist.
func allowedIPs() map[string]bool {
	var raw string
	db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='allowed_ips'`).Scan(&raw)
	set := map[string]bool{}
	for _, ip := range strings.Split(raw, ",") {
		if ip = normalizeIP(ip); ip != "" {
			set[ip] = true
		}
	}
	return set
}

// ipWhitelisted — совпал ли один из видимых IP клиента с whitelist.
func ipWhitelisted(c *fiber.Ctx) bool {
	set := allowedIPs()
	if len(set) == 0 {
		return false
	}
	for _, ip := range clientIPs(c) {
		if set[ip] {
			return true
		}
	}
	return false
}

// MaintenanceBypass — можно ли смотреть сайт и покупать во время тех. работ:
// IP в whitelist, bypass-cookie или активная сессия админки.
// Экспортируется (MaintenanceBypass) — используется и в CreatePayment.
func MaintenanceBypass(c *fiber.Ctx, cfg *config.Config) bool {
	if normalizeIP(c.Cookies(BypassCookie)) == "1" {
		return true
	}
	if middleware.ValidAdminToken(c.Cookies("admin_token"), cfg.JWTSecret) {
		return true
	}
	return ipWhitelisted(c)
}

func maintenanceBypassAndGrant(c *fiber.Ctx, cfg *config.Config) bool {
	if normalizeIP(c.Cookies(BypassCookie)) == "1" {
		return true
	}
	if middleware.ValidAdminToken(c.Cookies("admin_token"), cfg.JWTSecret) {
		return true
	}
	wl := ipWhitelisted(c)
	if wl && c.Cookies(BypassCookie) != "1" {
		// выдаём bypass-cookie, чтобы пережить смену IP и потерю заголовков
		c.Cookie(&fiber.Cookie{
			Name:     BypassCookie,
			Value:    "1",
			Path:     "/",
			MaxAge:   7 * 24 * 3600,
			HTTPOnly: false, // читает только бэкенд, но и фронт может показать статус
			Secure:   cfg.CookieSecure,
			SameSite: "Lax",
		})
	}
	return wl
}

func parseRFC3339(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err == nil {
		return t, nil
	}
	return time.Parse(time.RFC3339Nano, s)
}

// CheckMaintenance — состояние тех. работ для сайта.
// Все времена отдаём в UTC (RFC3339) + server_time, чтобы фронт считал таймер
// от серверных меток, а не от часов браузера.
func CheckMaintenance(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var until, scheduledAt, scheduledDuration string
		db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_until'`).Scan(&until)
		db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_scheduled_at'`).Scan(&scheduledAt)
		db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_scheduled_duration'`).Scan(&scheduledDuration)

		bypass := maintenanceBypassAndGrant(c, cfg)
		now := time.Now()

		// запланированные тех. работы: превращаем в активные, когда пришло время
		if scheduledAt != "" {
			st, err := parseRFC3339(scheduledAt)
			if err == nil && now.After(st) {
				dur, _ := time.ParseDuration(scheduledDuration + "m")
				if dur <= 0 {
					dur = 60 * time.Minute
				}
				newUntil := st.Add(dur).Format(time.RFC3339)
				db.Pool.Exec(context.Background(), `INSERT INTO settings(key,value) VALUES('maintenance_until',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, newUntil)
				db.Pool.Exec(context.Background(), `UPDATE settings SET value='' WHERE key='maintenance_scheduled_at'`)
				until = newUntil
				scheduledAt = ""
			}
		}

		// Протокол: maintenance/until — ЧЕСТВОЕ состояние (для всех),
		// bypass — флаг «этому клиенту можно смотреть сайт». Решение, что
		// показывать (в т.ч. админ-превью «глазами посетителя»), принимает фронт.
		resp := fiber.Map{
			"maintenance": false,
			"server_time": now.UTC().Format(time.RFC3339),
		}
		if bypass {
			resp["bypass"] = true
		}

		if until != "" {
			if t, err := parseRFC3339(until); err == nil && now.Before(t) {
				resp["maintenance"] = true
				resp["until"] = t.UTC().Format(time.RFC3339)
			}
		}

		if scheduledAt != "" {
			if st, err := parseRFC3339(scheduledAt); err == nil && now.Before(st) {
				resp["scheduled_at"] = st.UTC().Format(time.RFC3339)
				resp["locked"] = now.Add(3 * time.Minute).After(st) // покупки заблокированы за 3 минуты
			}
		}

		return c.JSON(resp)
	}
}
