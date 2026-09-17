package handlers

import (
	"context"
	"crypto/rand"
	"elytrix/internal/db"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ============================================================
// Картинки товаров. Храним в PostgreSQL (таблица product_images), а не на
// диске контейнера — переживают пересборку docker-образа без томов.
//
//   POST {admin}/upload-image  (multipart, поле file) → {"url":"/uploads/<name>.png"}
//   GET  /uploads/<name>       — раздача (кэш 1 год, immutable: имя уникально)
//
// Фронт и админка ходят по относительным /uploads/... — Next проксирует их
// на бэкенд (rewrites), поэтому домен всегда свой.
// ============================================================

var imageNameRe = regexp.MustCompile(`^[a-z0-9_-]{4,80}\.(png|jpg|jpeg|gif|webp)$`)

const maxImageBytes = 900 << 10 // 900 КБ (BodyLimit у fiber — 1 МБ)

// AdminUploadImage — принимает multipart-файл, проверяет магические байты и
// сохраняет в БД. Возвращает URL, который можно вставить в поле «картинка».
func AdminUploadImage(c *fiber.Ctx) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return c.Status(400).SendString("прикрепите файл в поле file")
	}
	if fh.Size > maxImageBytes {
		return c.Status(400).SendString("картинка больше 900 КБ — сожмите (лучше PNG/WebP ~256×256)")
	}
	src, err := fh.Open()
	if err != nil {
		return c.Status(400).SendString("не удалось прочитать файл")
	}
	defer src.Close()
	data, err := io.ReadAll(io.LimitReader(src, maxImageBytes+1))
	if err != nil || len(data) > maxImageBytes {
		return c.Status(400).SendString("не удалось прочитать файл")
	}
	var ext string
	switch http.DetectContentType(data[:min(512, len(data))]) {
	case "image/png":
		ext = "png"
	case "image/jpeg":
		ext = "jpg"
	case "image/gif":
		ext = "gif"
	case "image/webp":
		ext = "webp"
	default:
		return c.Status(400).SendString("можно загружать только PNG, JPG, GIF или WebP")
	}
	var rb [8]byte
	if _, err := rand.Read(rb[:]); err != nil {
		return c.Status(500).SendString("internal")
	}
	name := fmt.Sprintf("%d-%s.%s", time.Now().Unix(), hex.EncodeToString(rb[:]), ext)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_, err = db.Pool.Exec(ctx, `INSERT INTO product_images(name,data,ctype) VALUES($1,$2,$3)`,
		name, data, "image/"+ext)
	if err != nil {
		return c.Status(500).SendString("не удалось сохранить картинку")
	}
	return c.JSON(fiber.Map{"url": "/uploads/" + name})
}

// ServeProductImage — GET /uploads/<name>.
func ServeProductImage(c *fiber.Ctx) error {
	name := c.Params("name")
	if !imageNameRe.MatchString(name) {
		return c.SendStatus(fiber.StatusNotFound)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var data []byte
	var ctype string
	if db.Pool.QueryRow(ctx, `SELECT data, ctype FROM product_images WHERE name=$1`, name).Scan(&data, &ctype) != nil {
		return c.SendStatus(fiber.StatusNotFound)
	}
	c.Set("Content-Type", ctype)
	c.Set("Cache-Control", "public, max-age=31536000, immutable")
	return c.Send(data)
}
