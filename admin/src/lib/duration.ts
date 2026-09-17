// Разбор «человеческого» срока варианта оплаты: «2 недели», «48 часов»,
// «30 дней», «1 месяц», «60 минут», «1 год», «навсегда», голое число = дни.
// Результат: часы (для %hours%), дни (для %days%) и токен для LuckPerms
// (для %dur%): 14d → «14d», 36 часов → «1d12h», 2 часа → «2h».

export type ParsedDuration = {
  hours: number
  days: number
  dur: string
  forever: boolean
  ok: boolean
}

const FOREVER = /навсег|навечно|без\s*срок|бессроч|перманент|perman|forever|∞/i

function unitHours(u: string): number {
  if (/^мин(ут|у|ы)?/.test(u) || /^min|^m$/.test(u)) return 1 / 60
  if (/^сек/.test(u) || /^sec/.test(u)) return 1 / 3600
  if (/^ч(ас|асы|асов)?$/.test(u) || u === 'h' || /^hour/.test(u)) return 1
  if (/^(сутки|суток|дн(и|я)?|день|дня|дней)$/.test(u) || /^day/.test(u) || u === 'd') return 24
  if (/^нед(еля|ели|ель|елью|ей)?/.test(u) || /^week/.test(u) || u === 'w') return 168
  if (/^мес(яц|яца|яцев)?$/.test(u) || /^month/.test(u) || u === 'mo') return 720
  if (/^(год|года|лет)$/.test(u) || /^year/.test(u) || u === 'y' || u === 'г') return 8760
  return 0
}

export function toDur(hours: number): string {
  const d = Math.floor(hours / 24)
  const h = Math.round(hours % 24)
  if (d && h) return `${d}d${h}h`
  if (d) return `${d}d`
  return `${h}h`
}

export function parseDuration(input: string): ParsedDuration {
  const t = (input || '').trim().toLowerCase().replace(/,/g, '.')
  if (!t) return { hours: 0, days: 0, dur: '', forever: false, ok: false }
  if (FOREVER.test(t) || t === '0') return { hours: 0, days: 0, dur: '', forever: true, ok: true }

  let hours = 0
  let matched = false
  const re = /(\d+(?:\.\d+)?)\s*([a-zа-яё]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const n = parseFloat(m[1])
    const mult = unitHours(m[2])
    if (mult > 0) {
      hours += n * mult
      matched = true
    }
  }
  if (!matched) {
    const bare = /^(\d+(?:\.\d+)?)$/.exec(t)
    if (bare) {
      hours = parseFloat(bare[1]) * 24
      matched = true
    }
  }
  if (!matched || hours <= 0) return { hours: 0, days: 0, dur: '', forever: false, ok: false }

  hours = Math.max(1, Math.round(hours))
  return { hours, days: Math.floor(hours / 24), dur: toDur(hours), forever: false, ok: true }
}
