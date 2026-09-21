'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crown, RefreshCw, ServerCog, Shield, Timer, X } from 'lucide-react'

// ============================================================
// Топы сервера — модалка из шапки:
//   • «Топ донатеров» — сумма доната через сайт (PostgreSQL, заказы paid/issued)
//   • «Топ активных»  — наигранное время (MySQL плагина ElytrixSite)
//   • «Топы кланов»   — зарезервировано под ElytrixClans
// Ровно топ-10, если не влезает — скролл внутри списка.
// Головы: CSS-куб по текстуре скина, которую отдаёт /api/skin
// (бэкенд: ely.by → плагин сервера → ванильный Стив; ничего внешнего в браузере).
// ============================================================

type Donator = { name: string; amount: number; orders: number }
type Player = { name: string; seconds: number }
type TopData = { donators?: Donator[]; players?: Player[]; players_ok?: boolean; server_time?: string }

// SKIN_V — версия рендера голов: меняем соль → старые кэши браузеров (в т.ч.
// «24 часа» от прошлых версий) сами аннулируются без hard reload у игроков.
const SKIN_V = 'r4'

// 3D-голова из текстуры 64x64 (координаты граней головы: top 8,0 | front 8,8)
// nonce — «разнос» кэша браузера после ручного обновления (бэкенд тогда тоже
// перепроверяет источник через ?fresh=1)
function Head3D({ name, size = 36, nonce }: { name: string; size?: number; nonce?: string }) {
  const u = size / 8
  const half = size / 2
  const q = nonce ? `&v=${nonce}&fresh=1` : `&v=${SKIN_V}`
  const tex = {
    backgroundImage: `url(/api/skin?name=${encodeURIComponent(name)}${q})`,
    backgroundSize: `${64 * u}px ${64 * u}px`,
    imageRendering: 'pixelated' as const
  }
  // «солнце сверху-спереди», как в игре: верх светлый, бока темнее
  const faces: { pos: [number, number]; tr: string; br: number }[] = [
    { pos: [8, 8], tr: `translateZ(${half}px)`, br: 1 },                    // front
    { pos: [24, 8], tr: `rotateY(180deg) translateZ(${half}px)`, br: 0.78 }, // back
    { pos: [0, 8], tr: `rotateY(-90deg) translateZ(${half}px)`, br: 0.9 },  // viewer-left
    { pos: [16, 8], tr: `rotateY(90deg) translateZ(${half}px)`, br: 0.72 }, // viewer-right
    { pos: [8, 0], tr: `rotateX(90deg) translateZ(${half}px)`, br: 1.18 }    // top
  ]
  return (
    <div className="mc-head shrink-0" style={{ width: size, height: size }} aria-hidden>
      <div className="mc-head-inner" style={{ width: size, height: size }}>
        {faces.map((f, i) => (
          <div
            key={i}
            className="mc-face"
            style={{
              ...tex,
              width: size,
              height: size,
              backgroundPosition: `-${f.pos[0] * u}px -${f.pos[1] * u}px`,
              transform: f.tr,
              filter: `brightness(${f.br})`
            }}
          />
        ))}
      </div>
    </div>
  )
}

function fmtMoney(n: number) {
  return n.toLocaleString('ru-RU') + ' ₽'
}

function fmtPlaytime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h >= 1000) return `${h.toLocaleString('ru-RU')} ч`
  if (h === 0) return `${m} мин`
  return `${h.toLocaleString('ru-RU')} ч ${m} мин`
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

const RANK_COLORS = ['text-[#d99e1f]', 'text-[#8b95a5]', 'text-[#b0713a]']

export default function Tops({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<TopData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0) // 0 = донатеры, 1 = активные, 2 = кланы
  const [spinning, setSpinning] = useState(false)
  const [fade, setFade] = useState(false)
  const [nonce, setNonce] = useState('')
  const fetched = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback((refresh = false) => {
    if (refresh) {
      setSpinning(true)
      setNonce(String(Date.now())) // заодно сбрасываем кэш голов в браузере
    }
    const started = Date.now()
    fetch('/api/top' + (refresh ? '?refresh=1' : ''), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => {
        // держим анимацию минимум ~секунду — видно, что данные реально обновляются
        const wait = Math.max(0, 900 - (Date.now() - started))
        setTimeout(() => { setLoading(false); setSpinning(false) }, wait)
      })
  }, [])

  // данные тянем при первом открытии и держим свежими, пока окно открыто
  useEffect(() => {
    if (!open) return
    if (!fetched.current) {
      fetched.current = true
      load()
    }
    const i = setInterval(() => load(), 5 * 60 * 1000)
    return () => clearInterval(i)
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // подсказка скролла, когда есть куда листать
  const updateFade = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setFade(el.scrollTop + el.clientHeight < el.scrollHeight - 8)
  }, [])
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(updateFade)
    return () => cancelAnimationFrame(id)
  }, [open, tab, loading, data, updateFade])

  const donators = data?.donators || []
  const players = data?.players || []

  const rows: { name: string; stat: string; extra?: string }[] =
    tab === 0
      ? donators.slice(0, 10).map(d => ({ name: d.name, stat: fmtMoney(d.amount), extra: `${d.orders} ${plural(d.orders, 'покупка', 'покупки', 'покупок')}` }))
      : tab === 1
      ? players.slice(0, 10).map(p => ({ name: p.name, stat: fmtPlaytime(p.seconds) }))
      : []

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#20161f]/50 backdrop-blur-[3px] z-[60] flex items-center justify-center p-3 sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.97, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.97, y: 14, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            className="bg-white w-full max-w-[540px] h-[min(620px,88vh)] flex flex-col rounded-[20px] shadow-[0_30px_90px_-20px_rgba(30,12,30,0.45)] overflow-hidden"
          >
            {/* шапка: заголовок + действия */}
            <div className="shrink-0 px-5 sm:px-6 pt-5 pb-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display gradient-text text-[15px] sm:text-base leading-none mb-1.5">Elytrix</div>
                  <div className="font-display text-xl sm:text-[22px] leading-none">Топы сервера</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {spinning && (
                    <span className="text-[11px] font-semibold text-pink-deep animate-pulse whitespace-nowrap">Обновляем…</span>
                  )}
                  <button
                    onClick={() => !spinning && load(true)}
                    aria-label="Обновить"
                    disabled={spinning}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      spinning ? 'bg-pink text-white shadow-md shadow-pink/30 scale-95 cursor-wait' : 'text-ink/40 hover:text-pink-deep hover:bg-pink-soft/30'
                    }`}
                    title="Обновить топы и скины"
                  >
                    <RefreshCw size={14} className={spinning ? 'animate-spin [animation-duration:0.6s]' : ''} />
                  </button>
                  <button
                    onClick={onClose}
                    aria-label="Закрыть"
                    className="w-8 h-8 rounded-full text-ink/40 hover:text-ink hover:bg-black/5 flex items-center justify-center transition"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* табы: текстовые, с розовым подчёркиванием активного */}
              <div className="mt-4 grid grid-cols-3 gap-1 sm:gap-3 border-b border-ink/[0.07] -mb-px">
                {(['Топ донатеров', 'Топ активных', 'Топы кланов'] as const).map((label, i) => (
                  <button
                    key={label}
                    onClick={() => { setTab(i); listRef.current?.scrollTo({ top: 0 }) }}
                    className={`relative min-w-0 justify-center pb-2.5 text-[11px] sm:text-sm font-semibold transition-colors flex items-center gap-1 leading-tight ${
                      tab === i ? 'text-ink' : 'text-ink/40 hover:text-ink/70'
                    }`}
                  >
                    {i === 0 ? (
                      <Crown size={13} className={tab === i ? 'text-pink' : ''} />
                    ) : i === 1 ? (
                      <Timer size={13} className={tab === i ? 'text-pink' : ''} />
                    ) : (
                      <Shield size={13} className={tab === i ? 'text-pink' : ''} />
                    )}
                    {label}
                    {tab === i && (
                      <motion.span layoutId="tops-tab-underline" className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-pink" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* список */}
            <div className="relative flex-1 min-h-0">
              <div ref={listRef} onScroll={updateFade} className="h-full overflow-y-auto overscroll-contain px-1.5 sm:px-3 py-2">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {loading && tab !== 2 ? (
                      <div className="space-y-0.5 px-1.5">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                            <div className="w-5 h-5 rounded bg-ink/[0.05] animate-pulse" />
                            <div className="w-9 h-9 rounded-lg bg-ink/[0.05] animate-pulse" />
                            <div className="flex-1 h-3 rounded-full bg-ink/[0.05] animate-pulse" style={{ maxWidth: 120 }} />
                            <div className="w-14 h-3 rounded-full bg-ink/[0.05] animate-pulse" />
                          </div>
                        ))}
                      </div>
                    ) : rows.length === 0 ? (
                      <div className="text-center py-20 px-8">
                        {tab === 2 ? (
                          <>
                            <Shield size={24} className="mx-auto text-pink/50 mb-3" />
                            <div className="text-[13px] text-ink/50 leading-relaxed">
                              Топы кланов скоро появятся здесь.
                              <br />
                              Подготовлено под интеграцию с ElytrixClans.
                            </div>
                          </>
                        ) : tab === 1 && data && !data.players_ok ? (
                          <>
                            <ServerCog size={24} className="mx-auto text-pink/50 mb-3" />
                            <div className="text-[13px] text-ink/50 leading-relaxed">
                              Игровой сервер пока не передаёт статистику.
                              <br />
                              Плагин ElytrixSite начнёт копить время игры после обновления.
                            </div>
                          </>
                        ) : (
                          <div className="text-[13px] text-ink/40">Здесь пока пусто — будь первым!</div>
                        )}
                      </div>
                    ) : (
                      <ol className={`divide-y divide-ink/[0.045] transition-all duration-300 ${spinning ? 'opacity-40 blur-[1px] pointer-events-none' : ''}`}>
                        {rows.map((r, i) => (
                          <motion.li
                            key={nonce ? `${nonce}-${r.name}` : r.name}
                            initial={nonce ? { opacity: 0.25, y: 5 } : false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.035, duration: 0.25, ease: 'easeOut' }}
                            className={`flex items-center gap-3 sm:gap-3.5 px-2 sm:px-2.5 py-2 rounded-xl transition-colors ${
                              i === 0 ? 'bg-pink-soft/25 hover:bg-pink-soft/35' : 'hover:bg-ink/[0.025]'
                            }`}
                          >
                            <span className={`w-5 shrink-0 text-center text-[13px] font-bold tabular-nums ${RANK_COLORS[i] || 'text-ink/25'}`}>
                              {i + 1}
                            </span>
                            <div className="pl-1.5 pr-2.5 py-1">
                              <Head3D name={r.name} nonce={nonce} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate leading-tight font-semibold text-[14px] text-ink/85">{r.name}</div>
                              {r.extra && <div className="text-[10.5px] text-ink/35 leading-tight mt-0.5">{r.extra}</div>}
                            </div>
                            <span className={`shrink-0 tabular-nums text-[13.5px] sm:text-[14px] font-bold ${i === 0 ? 'text-pink-deep' : 'text-ink/70'}`}>
                              {r.stat}
                            </span>
                          </motion.li>
                        ))}
                      </ol>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
              {fade && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-gradient-to-t from-white via-white/80 to-transparent" />
              )}
            </div>

            <div className="shrink-0 px-5 py-2.5 border-t border-ink/[0.06] flex items-center justify-between text-[10.5px] text-ink/30">
              <span>{tab === 2 ? 'Скоро: ElytrixClans' : 'Топ-10 · обновляется каждые 5 минут'}</span>
              <span className="hidden sm:inline">наведи на голову ;)</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
