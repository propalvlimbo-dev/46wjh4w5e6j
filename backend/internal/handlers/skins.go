package handlers

import (
	"bytes"
	"context"
	"elytrix/internal/config"
	"elytrix/internal/plugin"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ============================================================
// GET /api/skin?name=Nick[&fresh=1] — 64x64 скин-текстура игрока.
//
// Голову-куб фронт рисует по текстуре сам (CSS 3D), поэтому нужен чистый
// PNG скина. Источники по порядку (первый отдавший валидную текстуру побеждает):
//  1. mc-heads.net/skin     — прокси Mojang, CDN, быстрый;
//  2. v1.minotar.net/skin   — второй прокси;
//  3. Mojang API напрямую   — name→uuid (api.mojang.com) → текстура со
//     sessionserver (для premium-аккаунтов, включая совсем свежие скины);
//  4. skinsystem.ely.by     — российская база (ely-аккаунты и пиратские
//     серверы с плагином Ely);
//  5. плагин ElytrixSite    — текстура из профиля игрока нашего сервера;
//  6. встроенный Стив       — если ни один источник не отдал скин.
//
// Кэш: 6 часов для реального скина, 10 минут для фолбэка; ?fresh=1
// принудительно перепроверяет источник (кнопка «обновить» в топах).
// ============================================================

var skinNameRe = regexp.MustCompile(`^[A-Za-z0-9_]{2,16}$`)

type skinEntry struct {
	png  []byte
	exp  time.Time
	real bool // настоящий скин, а не фолбэк (короткий TTL)
}

var (
	skinCache  sync.Map // name -> skinEntry
	skinClient = &http.Client{Timeout: 5 * time.Second}

	uuidCache sync.Map // lower name -> struct{id string; exp time.Time}
)

func GetSkin(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Query("name")
		if !skinNameRe.MatchString(name) {
			return c.Status(400).SendString("bad name")
		}
		fresh := c.Query("fresh") == "1"
		if !fresh {
			if v, ok := skinCache.Load(name); ok {
				e := v.(skinEntry)
				if time.Now().Before(e.exp) {
					return servePNG(c, e.png, e.real)
				}
			}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		data, real := fetchSkinTexture(ctx, cfg, name)
		ttl := 10 * time.Minute
		if real {
			ttl = 6 * time.Hour
		}
		skinCache.Store(name, skinEntry{png: data, exp: time.Now().Add(ttl), real: real})
		return servePNG(c, data, real)
	}
}

func servePNG(c *fiber.Ctx, data []byte, longCache bool) error {
	c.Set("Content-Type", "image/png")
	if longCache {
		c.Set("Cache-Control", "public, max-age=86400")
	} else {
		c.Set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
	}
	return c.Send(data)
}

var errSkin = errors.New("skin unavailable")

// fetchSkinTexture — возвращает PNG текстуры 64x64 и флаг «настоящий скин».
func fetchSkinTexture(ctx context.Context, cfg *config.Config, name string) ([]byte, bool) {
	for _, u := range []string{
		"https://mc-heads.net/skin/" + name,
		"https://v1.minotar.net/skin/" + name,
	} {
		if b, err := getPNG(ctx, u); err == nil && isSkinPNG(b) {
			return b, true
		}
	}
	// Mojang напрямую: самый актуальный источник для premium
	if url := mojangSkinURL(ctx, name); url != "" {
		if b, err := getPNG(ctx, url); err == nil && isSkinPNG(b) {
			return b, true
		}
	}
	// ely.by (в РФ работает стабильно)
	if b, err := getPNG(ctx, "https://skinsystem.ely.by/skins/"+name+".png"); err == nil && isSkinPNG(b) {
		return b, true
	}
	// текстура из игрового профиля через плагин
	if url := pluginSkinTexture(ctx, cfg, name); url != "" {
		if b, err := getPNG(ctx, url); err == nil && isSkinPNG(b) {
			return b, true
		}
	}
	// ванильный Стив (короткий кэш — при первой возможности заменится на реальный)
	return steveTexturePNG(), false
}

// mojangSkinURL — name → uuid → подписанный профиль → ссылка на текстуру.
func mojangSkinURL(ctx context.Context, name string) string {
	id := mojangUUID(ctx, name)
	if id == "" {
		return ""
	}
	b, err := rawGet(ctx, "https://sessionserver.mojang.com/session/minecraft/profile/"+id+"?unsigned=false")
	if err != nil {
		return ""
	}
	var prof struct {
		Properties []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"properties"`
	}
	if json.Unmarshal(b, &prof) != nil {
		return ""
	}
	for _, p := range prof.Properties {
		if p.Name != "textures" || p.Value == "" {
			continue
		}
		dec, err := base64.StdEncoding.DecodeString(p.Value)
		if err != nil {
			continue
		}
		var tex struct {
			Textures struct {
				SKIN struct {
					URL string `json:"url"`
				} `json:"SKIN"`
			} `json:"textures"`
		}
		if json.Unmarshal(dec, &tex) == nil && strings.HasPrefix(tex.Textures.SKIN.URL, "http") {
			return tex.Textures.SKIN.URL
		}
	}
	return ""
}

type uuidEntry struct {
	id  string
	exp time.Time
}

// mojangUUID — резолвинг ника в uuid (24ч, отрицательный ответ — 10 мин).
func mojangUUID(ctx context.Context, name string) string {
	key := strings.ToLower(name)
	if v, ok := uuidCache.Load(key); ok {
		e := v.(uuidEntry)
		if time.Now().Before(e.exp) {
			return e.id
		}
	}
	id := ""
	b, err := rawGet(ctx, "https://api.mojang.com/users/profiles/minecraft/"+name)
	if err == nil {
		var p struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(b, &p) == nil {
			id = p.ID
		}
	}
	ttl := 10 * time.Minute
	if id != "" {
		ttl = 24 * time.Hour
	}
	uuidCache.Store(key, uuidEntry{id: id, exp: time.Now().Add(ttl)})
	return id
}

func rawGet(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "elytrix-site/1.0")
	req.Header.Set("Accept", "application/json, image/png;q=0.8, */*;q=0.5")
	resp, err := skinClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 4<<20))
}

// isSkinPNG — PNG + минимальный размер свитка 64x32.
func isSkinPNG(b []byte) bool {
	if !(len(b) > 8 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') {
		return false
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(b))
	return err == nil && cfg.Width >= 64 && cfg.Height >= 32
}

func getPNG(ctx context.Context, url string) ([]byte, error) {
	if url == "" {
		return nil, errSkin
	}
	return rawGet(ctx, url)
}

func pluginSkinTexture(ctx context.Context, cfg *config.Config, name string) string {
	res, status, err := plugin.RequestJSON(cfg.PluginURL, cfg.PluginSecret, "/api/skin-urls", map[string][]string{"names": {name}})
	if err != nil || status != 200 {
		return ""
	}
	var m map[string]string
	if json.Unmarshal([]byte(res), &m) != nil {
		return ""
	}
	return m[name]
}

var (
	steveOnce sync.Once
	stevePNG  []byte
)

// steveTexturePNG — аккуратная ванильная текстура Стива: раскладка та же,
// что у Mojang, — голова-куб у фронтенда собирается без спецслучаев.
func steveTexturePNG() []byte {
	steveOnce.Do(func() {
		skin := color.NRGBA{0xC6, 0x9E, 0x7E, 0xFF}
		hair := color.NRGBA{0x4B, 0x36, 0x28, 0xFF}
		eyeW := color.NRGBA{0xFF, 0xFF, 0xFF, 0xFF}
		eyeB := color.NRGBA{0x50, 0x3E, 0x8F, 0xFF}
		mouth := color.NRGBA{0x9B, 0x79, 0x5F, 0xFF}
		nose := color.NRGBA{0xB2, 0x8C, 0x6C, 0xFF}
		img := image.NewNRGBA(image.Rect(0, 0, 64, 64))
		fill := func(x0, y0, w, h int, c color.NRGBA) {
			for y := y0; y < y0+h; y++ {
				for x := x0; x < x0+w; x++ {
					img.SetNRGBA(x, y, c)
				}
			}
		}
		// макушка
		fill(8, 0, 8, 8, hair)
		// 4 грани головы: кожа + волосы сверху рядом
		for _, x0 := range []int{0, 8, 16, 24} {
			fill(x0, 8, 8, 8, skin)
			fill(x0, 8, 8, 1, hair)
		}
		// лицо (front x8..15): челка, глаза, нос, рот
		fill(8, 9, 2, 1, hair)
		fill(14, 9, 2, 1, hair)
		fill(9, 12, 1, 2, eyeW)
		fill(10, 12, 1, 2, eyeB)
		fill(13, 12, 1, 2, eyeB)
		fill(14, 12, 1, 2, eyeW)
		fill(10, 14, 4, 1, nose)
		fill(10, 15, 4, 1, mouth)
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err == nil {
			stevePNG = buf.Bytes()
		}
	})
	return stevePNG
}
