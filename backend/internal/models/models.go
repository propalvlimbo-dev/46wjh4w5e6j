package models

type Product struct {
	ID          int             `json:"id"`
	CategoryID  int             `json:"category_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Image       string          `json:"image"`
	Price       int             `json:"price"`
	Commands    string          `json:"commands"`
	Sort        int             `json:"sort"`
	Active      bool            `json:"active"`
	Options     []ProductOption `json:"options,omitempty"`
}

// ProductOption — произвольный вариант оплаты («на сколько и за сколько»):
// своя подпись, цена, опциональные команды и длительность в днях.
// days подставляется в команды вместо %days%; пустой commands = команды товара.
// В публичном API (для покупателей) commands не отдаётся — только в админском.
type ProductOption struct {
	ID           int    `json:"id"`
	Label        string `json:"label"`
	Price        int    `json:"price"`
	Commands     string `json:"commands,omitempty"`
	Days         int    `json:"days"`
	Hours        int    `json:"hours"`
	Dur          string `json:"dur,omitempty"`
	DurationText string `json:"duration_text,omitempty"`
	Sort         int    `json:"sort"`
	Active       bool   `json:"active"`
}

type Category struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Sort int    `json:"sort"`
}
