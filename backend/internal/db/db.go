package db

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
)

var Pool *pgxpool.Pool

func Init(dsn string) error {
	p, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return err
	}
	Pool = p
	return migrate()
}

func migrate() error {
	_, err := Pool.Exec(context.Background(), `
	CREATE TABLE IF NOT EXISTS categories(
		id SERIAL PRIMARY KEY,
		name TEXT NOT NULL,
		sort INT DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS products(
		id SERIAL PRIMARY KEY,
		category_id INT REFERENCES categories(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		description TEXT DEFAULT '',
		image TEXT DEFAULT '',
		price INT NOT NULL,
		commands TEXT NOT NULL,
		sort INT DEFAULT 0,
		active BOOLEAN DEFAULT TRUE
	);
	CREATE TABLE IF NOT EXISTS orders(
		id UUID PRIMARY KEY,
		pay_num BIGSERIAL UNIQUE,
		player_name TEXT NOT NULL,
		player_uuid TEXT NOT NULL,
		product_id INT REFERENCES products(id),
		price INT NOT NULL,
		status TEXT DEFAULT 'pending',
		promo_code TEXT DEFAULT '',
		payment_id TEXT DEFAULT '',
		created_at TIMESTAMPTZ DEFAULT NOW(),
		paid_at TIMESTAMPTZ,
		issued_at TIMESTAMPTZ
	);
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS pay_num BIGSERIAL UNIQUE;
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code TEXT DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id TEXT DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS anypay_pay_id BIGINT;
	CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_anypay_pay_id ON orders(anypay_pay_id) WHERE anypay_pay_id IS NOT NULL;
	CREATE TABLE IF NOT EXISTS admin_logs(
		id SERIAL PRIMARY KEY,
		ip TEXT,
		action TEXT,
		data JSONB,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS promocodes(
		id SERIAL PRIMARY KEY,
		code TEXT UNIQUE NOT NULL,
		discount INT NOT NULL,
		max_uses INT DEFAULT 0,
		used INT DEFAULT 0,
		product_id INT DEFAULT NULL,
		expires_at TIMESTAMPTZ DEFAULT NULL,
		active BOOLEAN DEFAULT TRUE,
		created_at TIMESTAMPTZ DEFAULT NOW()
	);
	CREATE TABLE IF NOT EXISTS settings(
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS product_options(
		id SERIAL PRIMARY KEY,
		product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
		label TEXT NOT NULL,
		price INT NOT NULL,
		commands TEXT NOT NULL DEFAULT '',
		days INT NOT NULL DEFAULT 0,
		sort INT NOT NULL DEFAULT 0,
		active BOOLEAN NOT NULL DEFAULT TRUE
	);
	CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options(product_id);
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT '';
	ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_product_id_fkey;
	ALTER TABLE orders ADD CONSTRAINT orders_product_id_fkey
		FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
	UPDATE orders SET product_name = (SELECT name FROM products WHERE products.id = orders.product_id)
		WHERE (product_name IS NULL OR product_name = '') AND product_id IS NOT NULL;
	CREATE TABLE IF NOT EXISTS product_images(
		name TEXT PRIMARY KEY,
		data BYTEA NOT NULL,
		ctype TEXT NOT NULL DEFAULT 'image/png',
		created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	);
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS option_id INT;
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS option_label TEXT DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS commands_override TEXT DEFAULT '';
	ALTER TABLE orders ADD COLUMN IF NOT EXISTS coins_amount INT NOT NULL DEFAULT 0;
	DO $$ BEGIN
		IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='product_periods') THEN
			INSERT INTO product_options(product_id,label,price,commands,days,sort)
			SELECT product_id,
			       CASE period WHEN 'week' THEN 'Неделя' WHEN 'month' THEN 'Месяц' WHEN 'year' THEN 'Год' ELSE period END,
			       price, commands,
			       CASE period WHEN 'week' THEN 7 WHEN 'month' THEN 30 WHEN 'year' THEN 365 ELSE 0 END,
			       CASE period WHEN 'week' THEN 0 WHEN 'month' THEN 1 ELSE 2 END
			FROM product_periods
			ON CONFLICT DO NOTHING;
			DROP TABLE product_periods;
		END IF;
	END $$;
	ALTER TABLE product_options ADD COLUMN IF NOT EXISTS duration_hours INT NOT NULL DEFAULT 0;
	ALTER TABLE product_options ADD COLUMN IF NOT EXISTS dur TEXT NOT NULL DEFAULT '';
	ALTER TABLE product_options ADD COLUMN IF NOT EXISTS duration_text TEXT NOT NULL DEFAULT '';
	UPDATE product_options SET duration_hours=days*24, dur=days::text||'d', duration_text=days::text||' дней'
		WHERE days>0 AND duration_hours=0;
	INSERT INTO settings(key,value) VALUES('test_mode','false') ON CONFLICT DO NOTHING;
	INSERT INTO settings(key,value) VALUES('maintenance_until','') ON CONFLICT DO NOTHING;
	INSERT INTO settings(key,value) VALUES('allowed_ips','') ON CONFLICT DO NOTHING;
	CREATE INDEX IF NOT EXISTS idx_orders_player ON orders(player_uuid);
	CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
	CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
	CREATE INDEX IF NOT EXISTS idx_orders_paynum ON orders(pay_num);
	CREATE INDEX IF NOT EXISTS idx_promo_code ON promocodes(code);
	`)
	Pool.Exec(context.Background(), `
		DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints WHERE constraint_name='orders_status_check') THEN
				ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('pending','paid','issued','failed'));
			END IF;
		END $$;
	`)
	return err
}
