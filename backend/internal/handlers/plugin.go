package handlers

import (
	"elytrix/internal/config"
	"github.com/gofiber/fiber/v2"
	"net"
	"time"
)

func PluginStatus(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		addr := cfg.PluginURL
		if len(addr) > 7 && addr[:7] == "http://" {
			addr = addr[7:]
		}
		conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
		if err != nil {
			return c.JSON(fiber.Map{"ok": false})
		}
		conn.Close()
		return c.JSON(fiber.Map{"ok": true})
	}
}