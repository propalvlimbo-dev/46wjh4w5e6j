'use client'
import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Search, ChevronLeft, ChevronRight, X, TrendingUp, ShoppingBag, Calendar, Wallet } from 'lucide-react'

// старые заказы хранили период ключом — рисуем человекочитаемо; новые хранят снэпшот подписи варианта
const LEGACY_PERIODS: Record<string, string> = { week: 'Неделя', month: 'Месяц', year: 'Год' }
const optLabel = (v?: string) => (v && LEGACY_PERIODS[v]) || v || ''

const periods = [
  { key: 'day', label: 'День' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'year', label: 'Год' },
  { key: 'all', label: 'Всё' }
]

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null)
  const [period, setPeriod] = useState('week')
  const [orders, setOrders] = useState<any>({ orders: [], pages: 1, page: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<any>(null)

  useEffect(() => {
    fetch('/safdjuhos8dfuahj/stats?period=' + period, { credentials: 'include' })
      .then(r => r.json()).then(setStats).catch(() => location.href = '/safdjuhos8dfuahj')
  }, [period])

  const loadOrders = () => {
    fetch('/safdjuhos8dfuahj/orders?q=' + encodeURIComponent(search) + '&page=' + page, { credentials: 'include' })
      .then(r => r.json()).then(setOrders)
  }

  useEffect(() => {
    const t = setTimeout(loadOrders, 250)
    return () => clearTimeout(t)
  }, [search, page])

  const openDetail = (id: string) => {
    fetch(`/safdjuhos8dfuahj/orders/${id}`, { credentials: 'include' }).then(r => r.json()).then(setDetail)
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Обзор</h1>
        <p className="text-muted text-sm mt-1">Статистика проекта в реальном времени</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric icon={ShoppingBag} label="Всего покупок" value={stats?.orders ?? 0} />
        <Metric icon={Wallet} label="Общая выручка" value={fmt(stats?.revenue) + ' ₽'} accent />
        <Metric icon={Calendar} label="Покупок сегодня" value={stats?.today_orders ?? 0} />
        <Metric icon={TrendingUp} label="Выручка сегодня" value={fmt(stats?.today_revenue) + ' ₽'} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Динамика выручки</h2>
            <div className="text-xs text-muted mt-0.5">Изменения по дням</div>
          </div>
          <div className="flex gap-0.5 bg-card border border-border rounded-lg p-0.5">
            {periods.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-md text-xs transition ${period === p.key ? 'bg-hover text-text' : 'text-muted hover:text-text'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-6">
          {(stats?.chart || []).length < 2 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted text-sm gap-2">
              <TrendingUp size={24} className="opacity-30" />
              <div>Недостаточно данных для графика</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={stats.chart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6FA5" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#FF6FA5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#52525B" fontSize={11} tickLine={false} axisLine={false} dy={8} />
                <YAxis stroke="#52525B" fontSize={11} tickLine={false} axisLine={false} width={40} />
<Tooltip
  cursor={{ stroke: '#2A2A2F', strokeWidth: 1, strokeDasharray: '4 4' }}
  contentStyle={{ background: '#0F0F11', border: '1px solid #2A2A2F', borderRadius: 10, fontSize: 12, padding: '10px 14px' }}
  labelStyle={{ color: '#71717A', marginBottom: 6, fontSize: 11 }}
  itemStyle={{ color: '#FF6FA5', padding: 0 }}
  formatter={(v: any) => [fmt(v) + ' ₽', 'Выручка']}
  isAnimationActive={false}
/>
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#FF6FA5"
                  strokeWidth={2}
                  fill="url(#areaGrad)"
                  activeDot={{ r: 4, fill: '#FF6FA5', stroke: '#0F0F11', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">Покупки</h2>
            <div className="text-xs text-muted mt-0.5">{orders.total} записей</div>
          </div>
          <div className="relative w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Поиск по нику..." className="inp pl-8" />
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_100px_160px] px-5 py-3 border-b border-border text-[11px] uppercase tracking-wider text-muted font-medium">
            <div>Игрок</div>
            <div>Товар</div>
            <div className="text-right">Сумма</div>
            <div className="text-right">Дата</div>
          </div>
          {(orders.orders || []).length === 0 && (
            <div className="px-5 py-16 text-center text-muted text-xs">Нет покупок</div>
          )}
          {(orders.orders || []).map((o: any) => (
            <div key={o.id} onClick={() => openDetail(o.id)}
              className="grid grid-cols-[1fr_1fr_100px_160px] px-5 py-3.5 border-b border-border/40 last:border-b-0 hover:bg-hover/50 cursor-pointer transition items-center">
              <div className="font-medium text-sm">{o.player}</div>
              <div className="text-muted text-sm truncate flex items-center gap-1.5">
                <span className="truncate">{o.product}</span>
                {!!optLabel(o.option) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink/10 text-pink font-medium shrink-0">{optLabel(o.option)}</span>}
              </div>
              <div className="text-right text-pink font-semibold text-sm">{o.price} ₽</div>
              <div className="text-right text-muted text-xs">{new Date(o.time).toLocaleString('ru')}</div>
            </div>
          ))}
        </div>
        {orders.pages > 1 && (
          <div className="flex items-center justify-end mt-4">
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                className="p-1.5 rounded-md hover:bg-hover disabled:opacity-30 transition"><ChevronLeft size={14} /></button>
              {pageNumbers(page, orders.pages).map((p, i) => (
                p === '...' ? <span key={i} className="text-muted text-xs px-1">…</span> :
                <button key={i} onClick={() => setPage(p as number)}
                  className={`w-8 h-8 rounded-md text-xs transition font-medium ${page === p ? 'bg-pink text-white' : 'text-muted hover:bg-hover hover:text-text'}`}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(Math.min(orders.pages, page + 1))} disabled={page >= orders.pages}
                className="p-1.5 rounded-md hover:bg-hover disabled:opacity-30 transition"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </section>

      {detail && <DetailModal data={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function fmt(n: number | undefined) {
  if (n == null) return '0'
  return n.toLocaleString('ru-RU')
}

function Metric({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 hover:border-borderStrong transition">
      <div className="flex items-center gap-2 text-muted text-xs mb-2">
        <Icon size={13} />
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-semibold tracking-tight ${accent ? 'text-pink' : ''}`}>{value}</div>
    </div>
  )
}

function DetailModal({ data, onClose }: { data: any; onClose: () => void }) {
  const o = data.order
  const statusColors: any = {
    issued: 'bg-green-500/10 text-green-400 border-green-500/20',
    paid: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20'
  }
  const statusLabels: any = { issued: 'Выдан', paid: 'Оплачен', pending: 'Ожидание', failed: 'Ошибка' }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-border">
          <div>
            <div className="text-xs text-muted">Покупка</div>
            <div className="text-sm font-mono mt-0.5">#{o.id.slice(0, 8)}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md hover:bg-hover flex items-center justify-center transition">
            <X size={14} className="text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted mb-1">Игрок</div>
              <div className="text-base font-semibold">{o.player}</div>
              <div className="text-[10px] text-muted font-mono mt-1 break-all">{o.player_uuid}</div>
            </div>
            <div className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ${statusColors[o.status] || statusColors.pending}`}>
              {statusLabels[o.status] || o.status}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-bg border border-border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Товар</div>
              <div className="text-sm font-medium truncate">{o.product}</div>
            </div>
            <div className="bg-bg border border-border rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Сумма</div>
              <div className="text-sm font-semibold text-pink">{o.price} ₽</div>
            </div>
            {!!optLabel(o.option) && (
              <div className="bg-bg border border-border rounded-lg p-3 col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Срок</div>
                <div className="text-sm font-medium">{optLabel(o.option)}</div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted flex items-center gap-1.5">
            <Calendar size={11} />
            {new Date(o.created).toLocaleString('ru')}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Команды</div>
            <div className="bg-bg border border-border rounded-lg p-3 font-mono text-[11px] whitespace-pre-wrap text-text/80">{o.commands}</div>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Статистика игрока</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-muted">Покупок</div>
                <div className="text-lg font-semibold mt-0.5">{data.player_count}</div>
              </div>
              <div>
                <div className="text-xs text-muted">Потрачено</div>
                <div className="text-lg font-semibold text-pink mt-0.5">{data.player_total} ₽</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function pageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total]
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}