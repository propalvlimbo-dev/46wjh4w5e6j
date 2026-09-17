// Варианты оплаты товара («на какой срок»): админ сам задаёт подпись, цену,
// длительность в днях. Товар без вариантов продаётся разово по своей цене.

export type ProductOption = {
  id: number
  label: string
  price: number
  days?: number
  hours?: number
  dur?: string
  duration_text?: string
}

// Человекочитаемый срок варианта: сначала текст админа, потом часы/дни
export function fmtDuration(o: ProductOption): string {
  const t = (o.duration_text || '').trim()
  if (t) return t
  const h = o.hours || 0
  if (h >= 24 && h % 24 === 0) return `${h / 24} дн.`
  if (h > 0) return `${h} ч`
  if ((o.days || 0) > 0) return `${o.days} дн.`
  return ''
}

export type Priced = {
  price: number
  options?: ProductOption[] | null
}

export function hasOptions(p?: Priced | null): boolean {
  return !!p && Array.isArray(p.options) && p.options.length > 0
}

export function minOptionPrice(p: Priced): number {
  if (!hasOptions(p)) return p.price
  return Math.min(...(p.options as ProductOption[]).map(o => o.price))
}

export function pluralDays(days?: number): string {
  if (!days || days <= 0) return ''
  if (days === 1) return '1 день'
  if (days < 5 && (days % 10) >= 2) return days + ' дня'
  return days + ' дней'
}
