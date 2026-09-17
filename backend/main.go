package main

import (
	"elytrix/internal/config"
	"elytrix/internal/db"
	"elytrix/internal/handlers"
	"elytrix/internal/middleware"
	"elytrix/internal/redis"
	"github.com/gofiber/fiber/v2"
	"github.com/joho/godotenv"
	"log"
	"time"
)

func main() {
	godotenv.Load()
	cfg := config.Load()
	if err := db.Init(cfg.DBDsn); err != nil {
		log.Fatal(err)
	}
	redis.Init(cfg.RedisAddr, cfg.RedisPass)

	app := fiber.New(fiber.Config{BodyLimit: 1024 * 1024, DisableStartupMessage: true})

	api := app.Group("/api")
	api.Get("/maintenance", handlers.CheckMaintenance(cfg))
	api.Get("/products", handlers.GetProducts)
	api.Get("/categories", handlers.GetCategories)
	api.Get("/check-player", middleware.RateLimit("check", 20, time.Minute), handlers.CheckPlayer(cfg))
	api.Get("/check-promo", middleware.RateLimit("promo", 20, time.Minute), handlers.CheckPromo)
	api.Post("/create-payment", middleware.RateLimit("pay", 10, time.Minute), handlers.CreatePayment(cfg))
	api.Get("/payment/callback", handlers.PaymentCallback(cfg))
	api.Post("/payment/callback", handlers.PaymentCallback(cfg))
	api.Get("/payment/status", handlers.PaymentStatus)
	api.Get("/payment/verify", middleware.RateLimit("verify", 60, time.Minute), handlers.VerifyPayment(cfg))
	api.Get("/last-orders", handlers.LastOrders)
	api.Get("/top", handlers.GetTop(cfg))
	api.Get("/skin", middleware.RateLimit("skin", 300, time.Minute), handlers.GetSkin(cfg))

	// картинки товаров (хранятся в PostgreSQL,immutable-кэш по уникальному имени)
	app.Get("/uploads/:name", handlers.ServeProductImage)

	admin := app.Group(cfg.AdminPath)
	admin.Post("/login", middleware.RateLimit("login", 5, 15*time.Minute), handlers.AdminLogin(cfg))
	admin.Post("/logout", handlers.AdminLogout(cfg))

	aa := admin.Group("", middleware.AdminAuth(cfg))
	aa.Get("/stats", handlers.AdminStats)
    aa.Get("/products", handlers.AdminGetAllProducts)
    aa.Post("/products/reorder", handlers.AdminReorderProducts)
	aa.Post("/products", handlers.AdminCreateProduct)
	aa.Put("/products/:id", handlers.AdminUpdateProduct)
	aa.Delete("/products/:id", handlers.AdminDeleteProduct)
	aa.Get("/categories", handlers.GetCategories)
	aa.Post("/categories", handlers.AdminCreateCategory)
	aa.Delete("/categories/:id", handlers.AdminDeleteCategory)
	aa.Get("/orders", handlers.AdminSearchOrders)
	aa.Get("/orders/:id", handlers.AdminOrderDetails)
	aa.Post("/clear-orders", handlers.AdminClearOrders)
	aa.Get("/last-orders", handlers.LastOrders)
	aa.Get("/settings", handlers.AdminGetSettings)
	aa.Post("/settings", handlers.AdminUpdateSetting)
	aa.Post("/maintenance/enable", handlers.AdminEnableMaintenance)
	aa.Post("/maintenance/extend", handlers.AdminExtendMaintenance)
	aa.Post("/maintenance/schedule", handlers.AdminScheduleMaintenance)
	aa.Get("/promos", handlers.AdminGetPromos)
	aa.Post("/promos", handlers.AdminCreatePromo)
	aa.Delete("/promos/:id", handlers.AdminDeletePromo)
	aa.Post("/upload-image", middleware.RateLimit("upload", 40, time.Minute), handlers.AdminUploadImage)
	aa.Get("/plugin-status", handlers.PluginStatus(cfg))
	aa.Get("/logs", handlers.AdminGetLogs)

	log.Println("started on :" + cfg.Port)
	app.Listen(":" + cfg.Port)
}