package handlers

import (
	"context"
	"elytrix/internal/config"
	"elytrix/internal/db"
	"encoding/json"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"strconv"
	"strings"
	"time"
)

func logAction(c *fiber.Ctx, action string, data any) {
	b, _ := json.Marshal(data)
	ip := c.Get("X-Real-IP", c.IP())
	db.Pool.Exec(context.Background(),
		`INSERT INTO admin_logs(ip, action, data) VALUES($1, $2, $3)`, ip, action, string(b))
}

func AdminLogin(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		var body struct{ Password string `json:"password"` }
		if err := c.BodyParser(&body); err != nil {
			return c.Status(400).SendString("bad body")
		}
		if bcrypt.CompareHashAndPassword([]byte(cfg.AdminHash), []byte(body.Password)) != nil {
			logAction(c, "login_failed", nil)
			return c.Status(401).SendString("invalid")
		}
		claims := jwt.MapClaims{"exp": time.Now().Add(2 * time.Hour).Unix()}
		token, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.JWTSecret))
		c.Cookie(&fiber.Cookie{
			Name: "admin_token", Value: token,
			HTTPOnly: true, Secure: cfg.CookieSecure, SameSite: "Lax",
			MaxAge: 7200, Path: "/",
		})
		logAction(c, "login_success", nil)
		return c.JSON(fiber.Map{"ok": true})
	}
}

func AdminLogout(cfg *config.Config) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Cookie(&fiber.Cookie{
			Name: "admin_token", Value: "",
			HTTPOnly: true, Secure: cfg.CookieSecure, SameSite: "Lax",
			MaxAge: -1, Path: "/",
		})
		return c.JSON(fiber.Map{"ok": true})
	}
}

func AdminStats(c *fiber.Ctx) error {
	period := c.Query("period", "all")
	var where string
	switch period {
	case "day":
		where = "AND created_at > NOW() - INTERVAL '1 day'"
	case "week":
		where = "AND created_at > NOW() - INTERVAL '7 days'"
	case "month":
		where = "AND created_at > NOW() - INTERVAL '30 days'"
	case "year":
		where = "AND created_at > NOW() - INTERVAL '365 days'"
	}
	var totalOrders, totalRevenue int
	db.Pool.QueryRow(context.Background(), "SELECT COUNT(*), COALESCE(SUM(price),0) FROM orders WHERE status IN ('paid','issued') "+where).Scan(&totalOrders, &totalRevenue)
	var todayOrders, todayRevenue int
	db.Pool.QueryRow(context.Background(), "SELECT COUNT(*), COALESCE(SUM(price),0) FROM orders WHERE status IN ('paid','issued') AND created_at > NOW() - INTERVAL '1 day'").Scan(&todayOrders, &todayRevenue)
	rows, _ := db.Pool.Query(context.Background(), "SELECT DATE(created_at) as d, COUNT(*), COALESCE(SUM(price),0) FROM orders WHERE status IN ('paid','issued') "+where+" GROUP BY d ORDER BY d")
	defer rows.Close()
	type point struct {
		Date    string `json:"date"`
		Orders  int    `json:"orders"`
		Revenue int    `json:"revenue"`
	}
	var chart []point
	for rows.Next() {
		var p point
		var t time.Time
		rows.Scan(&t, &p.Orders, &p.Revenue)
		p.Date = t.Format("02.01")
		chart = append(chart, p)
	}
	if chart == nil {
		chart = []point{}
	}
	return c.JSON(fiber.Map{"orders": totalOrders, "revenue": totalRevenue, "today_orders": todayOrders, "today_revenue": todayRevenue, "chart": chart})
}

type optionIn struct {
	ID           int    `json:"id"`
	Label        string `json:"label"`
	Price        int    `json:"price"`
	Commands     string `json:"commands"`
	Days         int    `json:"days"`
	Hours        int    `json:"hours"`
	Dur          string `json:"dur"`
	DurationText string `json:"duration_text"`
	Active       *bool  `json:"active"`
}

// saveOptions — точечно обновляет список вариантов оплаты товара:
// присланные с id — апдейт (id сохраняются, заказы не «отваливаются»),
// новые без id — вставка, отсутствующие — удаление.
func saveOptions(ctx context.Context, tx pgx.Tx, productID int, list []optionIn) error {
	keep := []string{}
	args := []any{productID}
	for _, o := range list {
		if o.ID > 0 {
			args = append(args, o.ID)
			keep = append(keep, "$"+strconv.Itoa(len(args)))
		}
	}
	var err error
	if len(keep) > 0 {
		_, err = tx.Exec(ctx, `DELETE FROM product_options WHERE product_id=$1 AND id NOT IN (`+strings.Join(keep, ",")+`)`, args...)
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM product_options WHERE product_id=$1`, productID)
	}
	if err != nil {
		return err
	}
	for i, o := range list {
		label := strings.TrimSpace(o.Label)
		if label == "" || o.Price <= 0 {
			continue
		}
		active := true
		if o.Active != nil {
			active = *o.Active
		}
		if o.ID > 0 {
			res, err := tx.Exec(ctx,
				`UPDATE product_options SET label=$1,price=$2,commands=$3,days=$4,duration_hours=$5,dur=$6,duration_text=$7,sort=$8,active=$9 WHERE id=$10 AND product_id=$11`,
				label, o.Price, o.Commands, o.Days, o.Hours, o.Dur, o.DurationText, i, active, o.ID, productID)
			if err != nil {
				return err
			}
			if res.RowsAffected() > 0 {
				continue
			}
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO product_options(product_id,label,price,commands,days,duration_hours,dur,duration_text,sort,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			productID, label, o.Price, o.Commands, o.Days, o.Hours, o.Dur, o.DurationText, i, active); err != nil {
			return err
		}
	}
	return nil
}

func AdminCreateProduct(c *fiber.Ctx) error {
	var p struct {
		CategoryID  int        `json:"category_id"`
		Name        string     `json:"name"`
		Description string     `json:"description"`
		Image       string     `json:"image"`
		Price       int        `json:"price"`
		Commands    string     `json:"commands"`
		Options     []optionIn `json:"options"`
	}
	if err := c.BodyParser(&p); err != nil {
		return c.Status(400).SendString("bad body")
	}
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer tx.Rollback(ctx)
	var newID int
	err = tx.QueryRow(ctx, `INSERT INTO products(category_id,name,description,image,price,commands) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
		p.CategoryID, p.Name, p.Description, p.Image, p.Price, p.Commands).Scan(&newID)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	if err := saveOptions(ctx, tx, newID, p.Options); err != nil {
		return c.Status(500).SendString(err.Error())
	}
	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).SendString(err.Error())
	}
	logAction(c, "product_create", p)
	return c.JSON(fiber.Map{"ok": true, "id": newID})
}

func AdminUpdateProduct(c *fiber.Ctx) error {
	id := c.Params("id")
	var p struct {
		CategoryID  int        `json:"category_id"`
		Name        string     `json:"name"`
		Description string     `json:"description"`
		Image       string     `json:"image"`
		Price       int        `json:"price"`
		Commands    string     `json:"commands"`
		Active      bool       `json:"active"`
		Options     []optionIn `json:"options"`
	}
	if err := c.BodyParser(&p); err != nil {
		return c.Status(400).SendString("bad body")
	}
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `UPDATE products SET category_id=$1,name=$2,description=$3,image=$4,price=$5,commands=$6,active=$7 WHERE id=$8`,
		p.CategoryID, p.Name, p.Description, p.Image, p.Price, p.Commands, p.Active, id)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	var pid int
	if err := tx.QueryRow(ctx, `SELECT id FROM products WHERE id=$1`, id).Scan(&pid); err == nil {
		if err := saveOptions(ctx, tx, pid, p.Options); err != nil {
			return c.Status(500).SendString(err.Error())
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).SendString(err.Error())
	}
	logAction(c, "product_update", fiber.Map{"id": id, "data": p})
	return c.JSON(fiber.Map{"ok": true})
}

func AdminDeleteProduct(c *fiber.Ctx) error {
	id := c.Params("id")
	if _, err := db.Pool.Exec(context.Background(), `DELETE FROM products WHERE id=$1`, id); err != nil {
		return c.Status(500).SendString("Не удалось удалить: " + err.Error())
	}
	logAction(c, "product_delete", fiber.Map{"id": id})
	return c.JSON(fiber.Map{"ok": true})
}

func AdminCreateCategory(c *fiber.Ctx) error {
	var b struct{ Name string `json:"name"` }
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	db.Pool.Exec(context.Background(), `INSERT INTO categories(name) VALUES($1)`, b.Name)
	logAction(c, "category_create", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminDeleteCategory(c *fiber.Ctx) error {
	id := c.Params("id")
	if _, err := db.Pool.Exec(context.Background(), `DELETE FROM categories WHERE id=$1`, id); err != nil {
		return c.Status(500).SendString("Не удалось удалить: " + err.Error())
	}
	logAction(c, "category_delete", fiber.Map{"id": id})
	return c.JSON(fiber.Map{"ok": true})
}

func AdminSearchOrders(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q", ""))
	page := c.QueryInt("page", 1)
	if page < 1 {
		page = 1
	}
	perPage := 6
	offset := (page - 1) * perPage
	var total int
	if q != "" {
		db.Pool.QueryRow(context.Background(), "SELECT COUNT(*) FROM orders WHERE player_name ILIKE $1 AND status IN ('paid','issued')", "%"+q+"%").Scan(&total)
	} else {
		db.Pool.QueryRow(context.Background(), "SELECT COUNT(*) FROM orders WHERE status IN ('paid','issued')").Scan(&total)
	}
	var rows interface {
		Next() bool
		Scan(dest ...any) error
		Close()
	}
	var err error
	if q != "" {
		rows, err = db.Pool.Query(context.Background(), `SELECT o.id,o.player_name,COALESCE(NULLIF(o.product_name,''),p.name,'Товар удалён'),o.price,o.created_at,COALESCE(NULLIF(o.option_label,''), NULLIF(o.period,''),'') FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.player_name ILIKE $1 AND o.status IN ('paid','issued') ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`, "%"+q+"%", perPage, offset)
	} else {
		rows, err = db.Pool.Query(context.Background(), `SELECT o.id,o.player_name,COALESCE(NULLIF(o.product_name,''),p.name,'Товар удалён'),o.price,o.created_at,COALESCE(NULLIF(o.option_label,''), NULLIF(o.period,''),'') FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.status IN ('paid','issued') ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`, perPage, offset)
	}
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer rows.Close()
	type r struct {
		ID      string    `json:"id"`
		Player  string    `json:"player"`
		Product string    `json:"product"`
		Price   int       `json:"price"`
		Time    time.Time `json:"time"`
		Option  string    `json:"option"`
	}
	var list []r
	for rows.Next() {
		var x r
		rows.Scan(&x.ID, &x.Player, &x.Product, &x.Price, &x.Time, &x.Option)
		list = append(list, x)
	}
	if list == nil {
		list = []r{}
	}
	pages := (total + perPage - 1) / perPage
	return c.JSON(fiber.Map{"orders": list, "total": total, "pages": pages, "page": page})
}

func AdminOrderDetails(c *fiber.Ctx) error {
	id := c.Params("id")
	var order struct {
		ID          string    `json:"id"`
		Player      string    `json:"player"`
		PlayerUUID  string    `json:"player_uuid"`
		Product     string    `json:"product"`
		Description string    `json:"description"`
		Commands    string    `json:"commands"`
		Price       int       `json:"price"`
		Status      string    `json:"status"`
		Created     time.Time `json:"created"`
		Option      string    `json:"option"`
	}
	var option string
	err := db.Pool.QueryRow(context.Background(),
		`SELECT o.id,o.player_name,o.player_uuid,COALESCE(NULLIF(o.product_name,''),p.name,'Товар удалён'),COALESCE(p.description,''),COALESCE(NULLIF(o.commands_override,''),NULLIF(po.commands,''),p.commands,''),o.price,o.status,o.created_at,COALESCE(NULLIF(o.option_label,''), NULLIF(o.period,''),'')
		 FROM orders o
		 LEFT JOIN products p ON p.id=o.product_id
		 LEFT JOIN product_options po ON po.id=o.option_id
		 WHERE o.id=$1`, id).
		Scan(&order.ID, &order.Player, &order.PlayerUUID, &order.Product, &order.Description, &order.Commands, &order.Price, &order.Status, &order.Created, &option)
	if err != nil {
		return c.Status(404).SendString("not found")
	}
	order.Option = option
	var total, count int
	db.Pool.QueryRow(context.Background(), `SELECT COUNT(*), COALESCE(SUM(price),0) FROM orders WHERE player_name=$1 AND status IN ('paid','issued')`, order.Player).Scan(&count, &total)
	return c.JSON(fiber.Map{
		"order":        order,
		"player_total": total,
		"player_count": count,
	})
}

func AdminClearOrders(c *fiber.Ctx) error {
	var b struct{ Confirm string `json:"confirm"` }
	if err := c.BodyParser(&b); err != nil || b.Confirm != "DELETE ALL ORDERS" {
		return c.Status(400).JSON(fiber.Map{"error": "wrong confirm"})
	}
	db.Pool.Exec(context.Background(), `DELETE FROM orders`)
	logAction(c, "clear_all_orders", nil)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminGetSettings(c *fiber.Ctx) error {
	rows, _ := db.Pool.Query(context.Background(), `SELECT key,value FROM settings`)
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		m[k] = v
	}
	// IP текущего администратора так, как его видит бэкенд — для whitelist
	// это единственный достоверный источник (api.ipify.org не знает про IPv6)
	ips := clientIPs(c)
	if len(ips) > 0 {
		m["client_ip"] = ips[0]
	}
	m["server_time"] = time.Now().UTC().Format(time.RFC3339)
	return c.JSON(m)
}

func AdminUpdateSetting(c *fiber.Ctx) error {
	var b struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	db.Pool.Exec(context.Background(), `INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2`, b.Key, b.Value)
	logAction(c, "setting_update", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminEnableMaintenance(c *fiber.Ctx) error {
	var b struct {
		Minutes int `json:"minutes"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	if b.Minutes < 1 {
		return c.Status(400).JSON(fiber.Map{"error": "bad minutes"})
	}
	until := time.Now().Add(time.Duration(b.Minutes) * time.Minute).Format(time.RFC3339)
	db.Pool.Exec(context.Background(), `INSERT INTO settings(key,value) VALUES('maintenance_until',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, until)
	logAction(c, "maintenance_enable", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminExtendMaintenance(c *fiber.Ctx) error {
	var b struct {
		Minutes int `json:"minutes"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	if b.Minutes < 1 {
		return c.Status(400).JSON(fiber.Map{"error": "bad minutes"})
	}
	var current string
	db.Pool.QueryRow(context.Background(), `SELECT value FROM settings WHERE key='maintenance_until'`).Scan(&current)
	base := time.Now()
	if current != "" {
		t, err := time.Parse(time.RFC3339, current)
		if err == nil && t.After(base) {
			base = t
		}
	}
	until := base.Add(time.Duration(b.Minutes) * time.Minute).Format(time.RFC3339)
	db.Pool.Exec(context.Background(), `INSERT INTO settings(key,value) VALUES('maintenance_until',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, until)
	logAction(c, "maintenance_extend", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminScheduleMaintenance(c *fiber.Ctx) error {
	var b struct {
		Minutes  int `json:"minutes"`
		Duration int `json:"duration"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	if b.Minutes < 1 || b.Duration < 1 {
		return c.Status(400).JSON(fiber.Map{"error": "bad values"})
	}
	at := time.Now().Add(time.Duration(b.Minutes) * time.Minute).Format(time.RFC3339)
	db.Pool.Exec(context.Background(), `INSERT INTO settings(key,value) VALUES('maintenance_scheduled_at',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, at)
	db.Pool.Exec(context.Background(), `INSERT INTO settings(key,value) VALUES('maintenance_scheduled_duration',$1) ON CONFLICT(key) DO UPDATE SET value=$1`, strconv.Itoa(b.Duration))
	logAction(c, "maintenance_schedule", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminCreatePromo(c *fiber.Ctx) error {
	var b struct {
		Code      string `json:"code"`
		Discount  int    `json:"discount"`
		MaxUses   int    `json:"max_uses"`
		ProductID *int   `json:"product_id"`
		ExpiresAt string `json:"expires_at"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	if b.Discount < 1 || b.Discount > 100 {
		return c.Status(400).JSON(fiber.Map{"error": "discount 1-100"})
	}
	var exp interface{}
	if b.ExpiresAt != "" {
		t, e := time.Parse("2006-01-02", b.ExpiresAt)
		if e == nil {
			exp = t
		}
	}
	_, err := db.Pool.Exec(context.Background(), `INSERT INTO promocodes(code,discount,max_uses,product_id,expires_at) VALUES($1,$2,$3,$4,$5)`, strings.ToUpper(b.Code), b.Discount, b.MaxUses, b.ProductID, exp)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	logAction(c, "promo_create", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminGetPromos(c *fiber.Ctx) error {
	rows, _ := db.Pool.Query(context.Background(), `SELECT id,code,discount,max_uses,used,product_id,expires_at,active FROM promocodes ORDER BY created_at DESC`)
	defer rows.Close()
	type p struct {
		ID        int        `json:"id"`
		Code      string     `json:"code"`
		Discount  int        `json:"discount"`
		MaxUses   int        `json:"max_uses"`
		Used      int        `json:"used"`
		ProductID *int       `json:"product_id"`
		ExpiresAt *time.Time `json:"expires_at"`
		Active    bool       `json:"active"`
	}
	list := []p{}
	for rows.Next() {
		var x p
		rows.Scan(&x.ID, &x.Code, &x.Discount, &x.MaxUses, &x.Used, &x.ProductID, &x.ExpiresAt, &x.Active)
		list = append(list, x)
	}
	return c.JSON(list)
}

func AdminDeletePromo(c *fiber.Ctx) error {
	id := c.Params("id")
	db.Pool.Exec(context.Background(), `DELETE FROM promocodes WHERE id=$1`, id)
	logAction(c, "promo_delete", fiber.Map{"id": id})
	return c.JSON(fiber.Map{"ok": true})
}

func AdminReorderProducts(c *fiber.Ctx) error {
	var b struct {
		Order []int `json:"order"`
	}
	if err := c.BodyParser(&b); err != nil {
		return c.Status(400).SendString("bad body")
	}
	ctx := context.Background()
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return c.Status(500).SendString(err.Error())
	}
	defer tx.Rollback(ctx)
	for i, id := range b.Order {
		_, err := tx.Exec(ctx, `UPDATE products SET sort=$1 WHERE id=$2`, i, id)
		if err != nil {
			return c.Status(500).SendString(err.Error())
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return c.Status(500).SendString(err.Error())
	}
	logAction(c, "products_reorder", b)
	return c.JSON(fiber.Map{"ok": true})
}

func AdminGetLogs(c *fiber.Ctx) error {
	rows, _ := db.Pool.Query(context.Background(),
		`SELECT id, ip, action, data, created_at FROM admin_logs ORDER BY created_at DESC LIMIT 100`)
	defer rows.Close()
	type l struct {
		ID      int       `json:"id"`
		IP      string    `json:"ip"`
		Action  string    `json:"action"`
		Data    string    `json:"data"`
		Created time.Time `json:"created"`
	}
	list := []l{}
	for rows.Next() {
		var x l
		var data *string
		rows.Scan(&x.ID, &x.IP, &x.Action, &data, &x.Created)
		if data != nil {
			x.Data = *data
		}
		list = append(list, x)
	}
	return c.JSON(list)
}