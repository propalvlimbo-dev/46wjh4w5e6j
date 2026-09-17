package config

import "os"

type Config struct {
	Port                string
	DBDsn               string
	RedisAddr           string
	RedisPass           string
	AdminHash           string
	AdminPath           string
	JWTSecret           string
	PluginURL           string
	PluginSecret        string
	CookieSecure        bool
	AnyPayMerchantID    string
	AnyPayProjectSecret string
	AnyPayAPIID         string
	AnyPayAPIKey        string
	SiteURL             string
}

func Load() *Config {
	return &Config{
		Port:                os.Getenv("PORT"),
		DBDsn:               os.Getenv("DB_DSN"),
		RedisAddr:           os.Getenv("REDIS_ADDR"),
		RedisPass:           os.Getenv("REDIS_PASS"),
		AdminHash:           os.Getenv("ADMIN_PASSWORD_HASH"),
		AdminPath:           os.Getenv("ADMIN_PATH"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		PluginURL:           os.Getenv("PLUGIN_URL"),
		PluginSecret:        os.Getenv("PLUGIN_SECRET"),
		CookieSecure:        os.Getenv("COOKIE_SECURE") == "true",
		AnyPayMerchantID:    os.Getenv("ANYPAY_MERCHANT_ID"),
		AnyPayProjectSecret: os.Getenv("ANYPAY_PROJECT_SECRET"),
		AnyPayAPIID:         os.Getenv("ANYPAY_API_ID"),
		AnyPayAPIKey:        os.Getenv("ANYPAY_API_KEY"),
		SiteURL:             os.Getenv("SITE_URL"),
	}
}