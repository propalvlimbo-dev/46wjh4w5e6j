package handlers

import (
	"context"
	"crypto/md5"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"elytrix/internal/models"
	"elytrix/internal/plugin"
	"encoding/hex"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"strconv"
	"strings"
	"time"
)

func offlineUUID(name string) string {
	h := md5.Sum([]byte("OfflinePlayer:" + name))
	h[6] = (h[6] & 0x0f) | 0x30
	h[8] = (h[8] & 0x3f) | 0x80
	s := hex.EncodeToString(h[:])
	return s[0:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:32]
}

// attachOptions подгружает варианты оплаты. forAdmin=true — вместе с командами
// и неактивными (для админки); публично — только активные и без команд.
func attachOptions(list []models.Product, forAdmin bool) {
	if len(list) == 0 {
		return
	}
	ids := make([]int, 0, len(list))
	idx := map[int]int{}
	for i := range list {
		ids = append(ids, list[i].ID)
		idx[list[i].ID] = i
	}
	args := make([]any, len(ids))
	ph := make([]string, len(ids))
	for i, id := range ids {
		args[i] = id
		ph[i] = "$" + strconv.Itoa(i + 1)
	}
	base := `id,product_id,label,price,days,duration_hours,dur,duration_text,sort,active`
	if forAdmin {
		base += ",commands"
	}
	q := `SELECT ` + base + ` FROM product_options WHERE product_id IN (` + strings.Join(ph, ",") + `) ORDER BY sort, id`
	cmds := map[int]string{}
	rows, err := db.Pool.Query(context.Background(), q, args...)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var o models.ProductOption
		var pid int
		if forAdmin {
			var c string
			rows.Scan(&o.ID, &pid, &o.Label, &o.Price, &o.Days, &o.Hours, &o.Dur, &o.DurationText, &o.Sort, &o.Active, &c)
			o.Commands = c
			cmds[o.ID] = c
		} else {
			rows.Scan(&o.ID, &pid, &o.Label, &o.Price, &o.Days, &o.Hours, &o.Dur, &o.DurationText, &o.Sort, &o.Active)
			if !o.Active {
				continue
			}
		}
		if i, ok := idx[pid]; ok {
			list[i].Options = append(list[i].Options, o)
		}
	}
}

func GetProducts(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(context.Background(),
		`SELECT id,category_id,name,description,image,price,commands,sort,active FROM products WHERE active=TRUE ORDER BY sort ASC, price DESC`)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer rows.Close()
	list := []models.Product{}
	for rows.Next() {
		var p models.Product
		rows.Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Image, &p.Price, &p.Commands, &p.Sort, &p.Active)
		list = append(list, p)
	}
	attachOptions(list, false)
	return c.JSON(list)
}

func AdminGetAllProducts(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(context.Background(),
		`SELECT id,category_id,name,description,image,price,commands,sort,active FROM products ORDER BY sort ASC, price DESC`)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer rows.Close()
	list := []models.Product{}
	for rows.Next() {
		var p models.Product
		rows.Scan(&p.ID, &p.CategoryID, &p.Name, &p.Description, &p.Image, &p.Price, &p.Commands, &p.Sort, &p.Active)
		list = append(list, p)
	}
	attachOptions(list, true)
	return c.JSON(list)
}

func GetCategories(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(context.Background(), `SELECT id,name,sort FROM categories ORDER BY sort, id`)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer rows.Close()
	list := []models.Category{}
	for rows.Next() {
		var m models.Category
		rows.Scan(&m.ID, &m.Name, &m.Sort)
		list = append(list, m)
	}
	return c.JSON(list)
}

func CheckPlayer(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		name := c.Query("name")
		if len(name) < 3 || len(name) > 16 {
			return c.Status(400).JSON(fiber.Map{"ok": false, "error": "invalid name"})
		}
		res, _, err := plugin.Request(cfg.PluginURL, cfg.PluginSecret, "/api/check-player", []byte(name))
		if err != nil {
			return c.Status(502).JSON(fiber.Map{"ok": false, "error": "plugin offline"})
		}
		return c.JSON(fiber.Map{"ok": res == "OK"})
	}
}

func CheckPromo(c *fiber.Ctx) error {
	code := strings.ToUpper(strings.TrimSpace(c.Query("code")))
	productID := c.QueryInt("product_id", 0)
	if code == "" {
		return c.Status(400).JSON(fiber.Map{"ok": false, "error": "Введите промокод"})
	}
	var id, discount, maxUses, used int
	var productIDDb *int
	var expiresAt *time.Time
	var active bool
	err := db.Pool.QueryRow(context.Background(),
		`SELECT id,discount,max_uses,used,product_id,expires_at,active FROM promocodes WHERE code=$1`, code).
		Scan(&id, &discount, &maxUses, &used, &productIDDb, &expiresAt, &active)
	if err != nil {
		return c.JSON(fiber.Map{"ok": false, "error": "Промокод не найден"})
	}
	if !active {
		return c.JSON(fiber.Map{"ok": false, "error": "Промокод отключён"})
	}
	if expiresAt != nil && time.Now().After(*expiresAt) {
		return c.JSON(fiber.Map{"ok": false, "error": "Срок действия истёк"})
	}
	if maxUses > 0 && used >= maxUses {
		return c.JSON(fiber.Map{"ok": false, "error": "Промокод исчерпан"})
	}
	if productIDDb != nil && *productIDDb != productID {
		return c.JSON(fiber.Map{"ok": false, "error": "Не применим к этому товару"})
	}
	return c.JSON(fiber.Map{"ok": true, "discount": discount})
}

func MockPay(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct {
			Player    string `json:"player"`
			ProductID int    `json:"product_id"`
			Promo     string `json:"promo"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(400).SendString("bad body")
		}

		body.Player = strings.TrimSpace(body.Player)
		if len(body.Player) < 3 || len(body.Player) > 16 {
			return c.Status(400).JSON(fiber.Map{"error": "invalid name"})
		}

		var testMode string
		db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='test_mode'`).Scan(&testMode)
		if testMode != "true" {
			check, _, err := plugin.Request(cfg.PluginURL, cfg.PluginSecret, "/api/check-player", []byte(body.Player))
			if err != nil || check != "OK" {
				return c.Status(400).JSON(fiber.Map{"error": "Вы должны быть в игре для покупки"})
			}
		}

		ctx := context.Background()
		tx, err := db.Pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return c.Status(500).SendString(err.Error())
		}
		defer tx.Rollback(ctx)

		var price int
		var commands string
		err = tx.QueryRow(ctx,
			`SELECT price,commands FROM products WHERE id=$1 AND active=TRUE`, body.ProductID).
			Scan(&price, &commands)
		if err != nil {
			return c.Status(404).SendString("product not found")
		}

		promoApplied := ""
		if body.Promo != "" {
			code := strings.ToUpper(strings.TrimSpace(body.Promo))
			var pid, discount int
			err := tx.QueryRow(ctx,
				`UPDATE promocodes SET used=used+1
				 WHERE code=$1 AND active=TRUE
				   AND (expires_at IS NULL OR expires_at > NOW())
				   AND (max_uses = 0 OR used < max_uses)
				   AND (product_id IS NULL OR product_id = $2)
				 RETURNING id, discount`, code, body.ProductID).Scan(&pid, &discount)
			if err == nil {
				price = price * (100 - discount) / 100
				if price < 0 {
					price = 0
				}
				promoApplied = code
			}
		}

		orderID := uuid.New().String()
		pUUID := offlineUUID(body.Player)
		_, err = tx.Exec(ctx,
			`INSERT INTO orders(id,player_name,player_uuid,product_id,price,status,paid_at)
			 VALUES($1,$2,$3,$4,$5,'paid',NOW())`,
			orderID, body.Player, pUUID, body.ProductID, price)
		if err != nil {
			return c.Status(500).SendString(err.Error())
		}

		if err := tx.Commit(ctx); err != nil {
			return c.Status(500).SendString(err.Error())
		}

_, status, perr := plugin.RequestJSON(cfg.PluginURL, cfg.PluginSecret, "/api/complete-order", map[string]string{
    "id":       orderID,
    "player":   body.Player,
    "commands": commands,
})
		if perr == nil && status == 200 {
			db.Pool.Exec(context.Background(),
				`UPDATE orders SET status='issued', issued_at=NOW() WHERE id=$1`, orderID)
		}

		return c.JSON(fiber.Map{"ok": true, "order": orderID, "promo": promoApplied})
	}
}

func LastOrders(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(context.Background(),
		`SELECT o.player_name,COALESCE(NULLIF(o.product_name,''),p.name,'Товар удалён'),COALESCE(p.image,''),o.created_at FROM orders o
		 LEFT JOIN products p ON p.id=o.product_id
		 WHERE o.status IN ('paid','issued')
		 ORDER BY o.created_at DESC LIMIT 15`)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer rows.Close()
	type r struct {
		Player  string    `json:"player"`
		Product string    `json:"product"`
		Image   string    `json:"image"`
		Time    time.Time `json:"time"`
	}
	list := []r{}
	for rows.Next() {
		var x r
		rows.Scan(&x.Player, &x.Product, &x.Image, &x.Time)
		list = append(list, x)
	}
	return c.JSON(list)
}
