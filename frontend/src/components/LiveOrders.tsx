'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

type Order = { player: string; product: string; image: string; time: string }

function timeAgo(iso: string) {
  const d = new Date(iso).getTime()
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000))
  if (s < 60) return s + ' сек назад'
  const m = Math.floor(s / 60)
  if (m < 60) return m + ' мин назад'
  const h = Math.floor(m / 60)
  if (h < 24) return h + ' ч назад'
  return Math.floor(h / 24) + ' дн назад'
}

export default function LiveOrders() {
  const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const load = () => api<Order[]>('/api/last-orders').then(d => setOrders(d || [])).catch(() => {})
    load()
    const i = setInterval(load, 10000)
    return () => clearInterval(i)
  }, [])

  const list = (orders || []).slice(0, 15)
  if (list.length === 0) return null
  const duration = Math.max(25, list.length * 5)

  return (
    <section id="live" className="py-16 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <h2 className="font-display text-2xl sm:text-3xl mb-6 sm:mb-8">Последние покупки</h2>
        <div className="relative overflow-hidden rounded-2xl">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-24 bg-gradient-to-r from-bg to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-24 bg-gradient-to-l from-bg to-transparent z-10" />
          <div className="marquee-track" style={{ animationDuration: duration + 's' }}>
            {[0, 1].map(k => (
              <div key={k} className="flex gap-4 pr-4 shrink-0">
                {list.map((o, i) => (
                  <div key={i} className="glass rounded-2xl p-3 sm:p-4 min-w-[170px] w-[170px] sm:min-w-[200px] sm:w-[200px] text-center shrink-0">
                    <img src={o.image || '/images/placeholder.png'} className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-xl mb-2 object-cover" />
                    <div className="font-semibold text-sm truncate">{o.player}</div>
                    <div className="text-xs text-ink/60 truncate">{o.product}</div>
                    <div className="text-[11px] text-pink mt-1 font-medium">{timeAgo(o.time)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}