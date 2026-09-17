'use client'
import { colorize } from '@/lib/colorize'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import BuyModal from './BuyModal'

import { hasOptions, minOptionPrice, type ProductOption } from '@/lib/options'

type Category = { id: number; name: string }
type Product = {
  id: number; category_id: number; name: string; description: string
  image: string; price: number; options?: ProductOption[]
}

export default function Shop() {
  const [cats, setCats] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [buy, setBuy] = useState<Product | null>(null)

  useEffect(() => {
    api<Category[]>('/api/categories').then(c => { const list = c || []; setCats(list); if (list[0]) setActive(list[0].id) }).catch(() => {})
    api<Product[]>('/api/products').then(p => setProducts(p || [])).catch(() => {})
  }, [])

  const filtered = (products || []).filter(p => p.category_id === active)

  return (
    <section id="shop" className="px-4 sm:px-8 py-16 sm:py-20 relative">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl mb-8 sm:mb-10">Магазин</h2>

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 md:gap-8">
          <aside className="md:sticky md:top-28 h-fit">
            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
              {(cats || []).map(c => (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={`shrink-0 text-left px-4 py-2.5 rounded-xl text-sm font-medium transition ${active === c.id ? 'bg-pink text-white shadow-md shadow-pink/30' : 'hover:bg-white/70 text-ink/70'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </aside>

          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              <AnimatePresence mode="popLayout">
                {filtered.map((p, i) => (
                  <motion.div
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ y: -6 }}
                    className="glass rounded-2xl p-3 sm:p-4 group flex flex-col"
                  >
                    <div className="relative mb-3 overflow-hidden rounded-xl">
                      <img src={p.image || '/images/placeholder.png'} className="w-full aspect-square object-cover group-hover:scale-110 transition duration-500" />
                    </div>
                    <div className="font-display text-sm sm:text-base mb-1 truncate">{p.name}</div>
<div className="text-xs text-ink/60 mb-2 truncate min-h-[16px]">
  {colorize((p.description || '').split('\n')[0])}
</div>
                    {hasOptions(p) && (
                      <div className="flex flex-wrap gap-1 mb-2 min-h-[18px]">
                        {p.options!.slice(0, 3).map(o => (
                          <span key={o.id} className="text-[10px] px-1.5 py-0.5 rounded-md bg-pink-soft/30 text-pink-deep font-medium truncate max-w-full">
                            {o.label}
                          </span>
                        ))}
                        {p.options!.length > 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-pink-soft/20 text-ink/50 font-medium">+{p.options!.length - 3}</span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-auto gap-2">
                      <div className="font-bold text-sm">
                        {hasOptions(p) && <span className="text-ink/50 font-medium text-xs mr-0.5">от</span>}
                        {minOptionPrice(p)} ₽
                      </div>
                      <button
                        onClick={() => setBuy(p)}
                        className="bg-pink text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-pink-deep transition"
                      >
                        Купить
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
      {buy && <BuyModal product={buy} onClose={() => setBuy(null)} />}
    </section>
  )
}