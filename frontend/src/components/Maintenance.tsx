'use client'
import { useEffect, useRef, useState } from 'react'
import { Wrench, Clock, Loader2 } from 'lucide-react'

// ============================================================
// Тех. работы — переписано с нуля.
//
//  1. Каждые 5 сек (во время тех. работ — каждые 2 сек) опрашиваем
//     /api/maintenance.
//  2. Таймер НЕ зависит от часов браузера: сервер отдаёт `until` и
//     `server_time` (оба в UTC). Остаток = until - server_time в момент ответа,
//     дальше тикаем по monotonic-часам (performance.now) и подстраиваемся на
//     каждом опросе. Перевод часов в ОС, кривой time-zone, сон вкладки —
//     отсчёт больше не ломается и не «прыгает».
//  3. Fail-closed: если бэкенд недоступен (деплой/рестарт/отвал), обычный
//     пользователь продолжает видеть «Тех. работы» (с отсчётом от последнего
//     известного состояния), а не «сломанный» сайт.
//  4. Обход: IP из whitelist или залогиненная админка. При совпадении IP
//     бэкенд ставит cookie `elytrix_bypass` (7 дней) и отдаёт `bypass:true`;
//     флаг кэшируется в localStorage — при недоступном бэке обход продолжает
//     работать. При этом `maintenance`/`until` сервер всегда отдаёт честно,
//     а фронт показывает админу плашку «смотрите как посетитель» — по клику
//     включается предпросмотр экрана тех. работ (sessionStorage elytrix_view).
//  5. По окончании таймера показываем «завершаем…»; как только бэк ответит
//     «ок» — один раз перезагружаем страницу (заодно подтягиваем свежий билд
//     после редиплоя фронта).
// ============================================================

const LS_KEY = 'elytrix_maint_v1'
const VIEW_KEY = 'elytrix_view'
const SS_RELOAD = 'elytrix_maint_reloaded'
const POLL_MS = 5000
const POLL_RETRY_MS = 2000
const FETCH_TIMEOUT_MS = 7000

type CachedState = {
  on: boolean        // показывать экран тех. работ
  until: number      // epoch ms окончания (по серверным меткам), 0 = нет данных
  bypass: boolean    // пользователь в whitelist / сессия админки
  remainingMs: number      // остаток до окончания на момент синхронизации
  scheduledRemainingMs?: number // остаток до начала запланированных работ
  savedAt: number    // Date.now() последней синхронизации
}

type LiveState = {
  phase: 'loading' | 'open' | 'maintenance' | 'finishing'
  bypass: boolean
  locked?: boolean
}

function readCache(): CachedState | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (typeof c?.savedAt !== 'number') return null
    return c as CachedState
  } catch {
    return null
  }
}

function writeCache(patch: Partial<CachedState>) {
  try {
    const prev = readCache() || ({ on: false, until: 0, bypass: false, remainingMs: 0, savedAt: 0 } as CachedState)
    localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...patch, savedAt: Date.now() }))
  } catch {}
}

function sinceSaved(cache: CachedState): number {
  const elapsed = Date.now() - cache.savedAt
  return elapsed > 0 ? elapsed : 0
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return {
    d: days > 0 ? String(days) : null,
    h: String(h).padStart(2, '0'),
    m: String(m).padStart(2, '0'),
    s: String(sec).padStart(2, '0')
  }
}

function isPreviewNow(): boolean {
  if (typeof window === 'undefined') return false
  try {
    // ссылка «смотреть как посетитель» из админки: /?maintpreview=1
    if (location.search.includes('maintpreview')) {
      sessionStorage.setItem(VIEW_KEY, 'visitor')
      const u = new URL(location.href)
      u.searchParams.delete('maintpreview')
      history.replaceState(null, '', u.pathname + (u.search || '') + u.hash)
    }
    return sessionStorage.getItem(VIEW_KEY) === 'visitor'
  } catch {
    return false
  }
}

export default function Maintenance({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LiveState>({ phase: 'loading', bypass: false })
  const [remaining, setRemaining] = useState(0)
  const [schedRemaining, setSchedRemaining] = useState<number | undefined>(undefined)
  const [preview, setPreview] = useState<boolean>(() => isPreviewNow())
  const [realMaint, setRealMaint] = useState(false)
  const previewRef = useRef(false)
  previewRef.current = preview
  const lastOkRef = useRef<any>(null)

  // Синхронизация таймера: остаток на момент ответа + monotonic-время ответа
  const remRef = useRef(0)
  const syncRef = useRef(0)
  const schedRemRef = useRef<number | undefined>(undefined)
  const schedSyncRef = useRef(0)
  const wasDownRef = useRef(false)   // предыдущий опрос упал?
  const everSawOkRef = useRef(false) // бэк отвечал хоть раз за эту загрузку?
  const lastShownRef = useRef(-1)    // чтобы не ререндерить на каждом тике
  const lastShownSchedRef = useRef(-1)
  const phaseRef = useRef(state.phase)
  phaseRef.current = state.phase

  // Применение ответа /api/maintenance. `maintenance` от сервера — честная
  // для всех; обход (bypass) отменяет экран ТОЛЬКО для обходчика без превью.
  const applyMaint = (d: any) => {
    everSawOkRef.current = true
    const wasDown = wasDownRef.current
    wasDownRef.current = false
    lastOkRef.current = d

    const serverNow = d?.server_time ? new Date(d.server_time).getTime() : Date.now()
    const until = d?.until ? new Date(d.until).getTime() : 0
    const sched = d?.scheduled_at ? new Date(d.scheduled_at).getTime() : 0

    let rem = 0
    if (d?.maintenance && d?.until && isFinite(until) && isFinite(serverNow)) {
      rem = Math.max(0, until - serverNow)
    }
    remRef.current = rem
    syncRef.current = performance.now()

    let sr: number | undefined = undefined
    if (sched && isFinite(sched) && isFinite(serverNow)) {
      sr = Math.max(0, sched - serverNow)
      schedRemRef.current = sr
      schedSyncRef.current = performance.now()
    } else {
      schedRemRef.current = undefined
      schedSyncRef.current = 0
    }
    setSchedRemaining(sr)
    setRealMaint(!!d?.maintenance)

    writeCache({
      on: !!d?.maintenance,
      until,
      bypass: !!d?.bypass,
      remainingMs: rem,
      scheduledRemainingMs: sr
    })

    if (d?.bypass) {
      try { sessionStorage.removeItem(SS_RELOAD) } catch {}
    }

    const showMaint = !!d?.maintenance && (!d?.bypass || previewRef.current)
    if (showMaint) {
      setState({ phase: 'maintenance', bypass: !!d?.bypass })
      return
    }
    // Тех. работ нет (или это обходчик вне превью), но перед этим бэк был
    // недоступен (деплой/рестарт) — перезагружаемся один раз, чтобы подтянуть
    // свежий билд и данные.
    if (wasDown && !d?.maintenance) {
      try {
        const lastReload = Number(sessionStorage.getItem(SS_RELOAD) || '0')
        if (!lastReload || Date.now() - lastReload > 15000) {
          sessionStorage.setItem(SS_RELOAD, String(Date.now()))
          location.reload()
          return
        }
      } catch {}
    }
    setState({ phase: 'open', bypass: !!d?.bypass, locked: !!d?.locked })
  }

  const togglePreview = (on: boolean) => {
    try {
      if (on) sessionStorage.setItem(VIEW_KEY, 'visitor')
      else sessionStorage.removeItem(VIEW_KEY)
    } catch {}
    previewRef.current = on
    setPreview(on)
    if (lastOkRef.current) applyMaint(lastOkRef.current)
  }

  useEffect(() => {
    let stop = false
    let timer = 0

    const applyRemaining = () => {
      if (syncRef.current > 0) {
        const live = Math.max(0, remRef.current - (performance.now() - syncRef.current))
        const sec = Math.ceil(live / 1000)
        if (sec !== lastShownRef.current) {
          lastShownRef.current = sec
          setRemaining(live)
        }
      }
      if (schedSyncRef.current > 0 && schedRemRef.current != null) {
        const live = Math.max(0, schedRemRef.current - (performance.now() - schedSyncRef.current))
        const sec = Math.ceil(live / 1000)
        if (sec !== lastShownSchedRef.current) {
          lastShownSchedRef.current = sec
          setSchedRemaining(live)
        }
      }
    }

    const schedule = () => {
      clearTimeout(timer)
      const st = phaseRef.current
      const next = st === 'maintenance' || st === 'finishing' ? POLL_RETRY_MS : POLL_MS
      timer = window.setTimeout(() => { poll(); schedule() }, next)
    }

    const handleOk = (d: any) => { if (!stop) applyMaint(d) }

    const handleErr = () => {
      if (stop) return
      wasDownRef.current = true
      const cache = readCache()
      if (cache?.bypass && !previewRef.current) {
        // обходчик при упавшем бэке просто видит «офлайн-версию» сайта
        setState(s => (s.phase === 'open' ? s : { phase: 'open', bypass: true }))
        return
      }
      const rem = cache?.on ? Math.max(0, (cache.remainingMs || 0) - sinceSaved(cache)) : -1
      if (cache?.on && rem > 0) {
        // были тех. работы с таймером — продолжаем показывать и считать
        remRef.current = rem
        syncRef.current = performance.now()
        lastShownRef.current = -1
        setRemaining(rem)
        setState({ phase: 'maintenance', bypass: false })
        return
      }
      // бэк недоступен → fail-closed: показываем тех. работы
      // (если до этого тех. работы уже «истекли» — экран «завершаем…»)
      setState({ phase: everSawOkRef.current || cache?.on ? 'finishing' : 'maintenance', bypass: false })
    }

    const poll = () => {
      const timeout = setTimeout(() => handleErr(), FETCH_TIMEOUT_MS)
      fetch('/api/maintenance', { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('http ' + r.status))))
        .then(d => { clearTimeout(timeout); handleOk(d) })
        .catch(() => { clearTimeout(timeout); handleErr() })
    }

    // Состояние из кэша до первого ответа — без flash'а контентом
    const cache = readCache()
    if (cache) {
      setRealMaint(!!cache.on)
      if (cache.on && (!cache.bypass || previewRef.current)) {
        const rem = Math.max(0, (cache.remainingMs || 0) - sinceSaved(cache))
        remRef.current = rem
        syncRef.current = performance.now()
        setRemaining(rem)
        setState({ phase: rem > 0 ? 'maintenance' : 'finishing', bypass: !!cache.bypass })
      } else {
        setState({ phase: 'open', bypass: !!cache.bypass })
      }
      if (cache.scheduledRemainingMs != null && cache.scheduledRemainingMs > 0) {
        const sr = Math.max(0, cache.scheduledRemainingMs - sinceSaved(cache))
        schedRemRef.current = sr
        schedSyncRef.current = performance.now()
        setSchedRemaining(sr)
      }
    }

    poll()
    schedule()
    const tick = setInterval(applyRemaining, 250)

    return () => {
      stop = true
      clearTimeout(timer)
      clearInterval(tick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Таймер дошёл до нуля, пока мы «в тех. работах» → экран «завершаем…»
  useEffect(() => {
    if (state.phase === 'maintenance' && remRef.current > 0 && remaining <= 0) {
      setState(s => (s.phase === 'maintenance' ? { ...s, phase: 'finishing' } : s))
    }
  }, [remaining, state.phase])

  if (state.phase === 'loading') return null

  if (state.phase === 'maintenance' || state.phase === 'finishing') {
    const t = fmt(remaining)
    const showTimer = state.phase === 'maintenance' && remaining > 0
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg relative overflow-hidden">
        <div className="blob bg-pink-soft w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] -top-40 -left-40" />
        <div className="blob bg-pink w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bottom-[-100px] right-[-80px]" />

        {state.bypass && (
          <button
            onClick={() => togglePreview(false)}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-[11px] sm:text-xs px-3.5 py-1.5 rounded-full bg-white/80 border border-pink-soft text-ink/70 hover:text-pink-deep shadow-md transition"
          >
            ← Выйти из предпросмотра (вы админ)
          </button>
        )}
        <div className="relative z-10 text-center max-w-lg w-full">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/70 backdrop-blur-xl border border-pink-soft/50 shadow-lg shadow-pink/10 mb-6 sm:mb-8">
            <Wrench size={20} className="text-pink" strokeWidth={2.2} />
          </div>

          {state.phase === 'finishing' ? (
            <>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl leading-tight mb-4 tracking-tight px-2">
                Скоро <span className="gradient-text">вернёмся</span>
              </h1>
              <p className="text-ink/50 text-sm sm:text-base mb-8 max-w-sm mx-auto leading-relaxed px-4">
                Сервер обновляется и уже почти готов. Страница перезагрузится автоматически.
              </p>
              <div className="flex items-center justify-center gap-2 text-ink/40 text-sm">
                <Loader2 size={16} className="animate-spin text-pink" />
                Подключаемся к серверу…
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl sm:text-5xl md:text-6xl leading-tight mb-4 tracking-tight px-2">
                Технические <span className="gradient-text">работы</span>
              </h1>

              <p className="text-ink/50 text-sm sm:text-base mb-10 sm:mb-14 max-w-sm mx-auto leading-relaxed px-4">
                Мы скоро вернёмся. Обновляем сервис, чтобы стало ещё лучше.
              </p>

              {showTimer ? (
                <div className="flex flex-col items-center gap-5 sm:gap-6">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-ink/30 font-medium">До окончания</div>
                  <div className="flex items-end gap-3 sm:gap-5 text-ink/70">
                    {t.d && (
                      <>
                        <Seg value={t.d} label="дней" />
                        <Sep />
                      </>
                    )}
                    <Seg value={t.h} label="часов" />
                    <Sep />
                    <Seg value={t.m} label="минут" />
                    <Sep />
                    <Seg value={t.s} label="секунд" />
                  </div>
                </div>
              ) : (
                <div className="text-ink/40 text-sm flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin text-pink" /> Уточняем время окончания…
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {schedRemaining != null && schedRemaining > 0 && (!state.bypass || preview) && <ScheduledBanner remaining={schedRemaining} locked={!!state.locked} />}
      {realMaint && state.bypass && !preview && (
        <div className="fixed top-16 sm:top-20 left-1/2 -translate-x-1/2 z-[55] max-w-[92vw] bg-amber-400/95 text-amber-950 rounded-full px-4 py-2 shadow-lg backdrop-blur flex items-center gap-2.5 text-[11px] sm:text-xs font-medium">
          <Wrench size={13} className="shrink-0" />
          <span className="truncate sm:whitespace-nowrap">Идут тех. работы — вы видите сайт как админ/whitelist</span>
          <button onClick={() => togglePreview(true)} className="shrink-0 underline font-semibold hover:no-underline">
            Смотреть как посетитель
          </button>
        </div>
      )}
      {state.bypass && state.locked && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 glass rounded-full px-4 py-2 text-xs text-ink/60 flex items-center gap-2 shadow-lg">
          <Wrench size={12} className="text-pink" /> Вы в списке обхода — покупки для вас открыты
        </div>
      )}
      {children}
    </>
  )
}

function Sep() {
  return <span className="font-sans text-2xl sm:text-3xl font-extralight text-ink/15 pb-5 sm:pb-6 select-none">:</span>
}

function ScheduledBanner({ remaining, locked }: { remaining: number; locked: boolean }) {
  const totalSec = Math.max(0, Math.ceil(remaining / 1000))
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  return (
    <div className={`fixed top-20 sm:top-24 left-1/2 -translate-x-1/2 z-30 ${locked ? 'bg-red-500/95' : 'bg-pink/95'} text-white rounded-full px-5 py-2.5 shadow-lg backdrop-blur flex items-center gap-2 text-xs sm:text-sm font-medium max-w-[90vw]`}>
      <Clock size={14} />
      <span>
        {locked ? `Тех. работы через ${mins}:${String(secs).padStart(2, '0')} · покупки заблокированы` : `Тех. работы через ${mins}:${String(secs).padStart(2, '0')}`}
      </span>
    </div>
  )
}

function Seg({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 sm:gap-2 min-w-[44px] sm:min-w-[64px]">
      <span className="font-sans text-4xl sm:text-5xl md:text-6xl font-extralight tabular-nums text-ink/80 leading-none tracking-tight">
        {value}
      </span>
      <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-ink/30 font-medium">
        {label}
      </span>
    </div>
  )
}
