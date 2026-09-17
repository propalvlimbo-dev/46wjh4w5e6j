package middleware

import (
	"elytrix/internal/config"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

func AdminAuth(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !ValidAdminToken(c.Cookies("admin_token"), cfg.JWTSecret) {
			return c.Status(401).SendString("unauthorized")
		}
		return c.Next()
	}
}

// ValidAdminToken — проверяет JWT-сессию админки по cookie-значению.
func ValidAdminToken(token, secret string) bool {
	if token == "" || secret == "" {
		return false
	}
	t, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		return []byte(secret), nil
	})
	return err == nil && t.Valid
}