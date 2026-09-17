package middleware

import (
	"context"
	"elytrix/internal/redis"
	"github.com/gofiber/fiber/v2"
	"strconv"
	"time"
)

func RateLimit(key string, limit int, window time.Duration) fiber.Handler {
	return func(c *fiber.Ctx) error {
		k := "rl:" + key + ":" + c.IP()
		ctx := context.Background()
		n, _ := redis.Client.Incr(ctx, k).Result()
		if n == 1 {
			redis.Client.Expire(ctx, k, window)
		}
		if n > int64(limit) {
			return c.Status(429).SendString("Too many requests: " + strconv.FormatInt(n, 10))
		}
		return c.Next()
	}
}