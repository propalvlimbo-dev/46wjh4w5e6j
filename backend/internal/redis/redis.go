package redis

import (
	"github.com/redis/go-redis/v9"
)

var Client *redis.Client

func Init(addr, pass string) {
	Client = redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: pass,
	})
}