'use client'
import { colorize } from '@/lib/colorize'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { motion, AnimatePresence } from 'framer-motion'
import BuyModal from './BuyModal'
import { Coins } from 'lucide-react'

import { hasOptions, minOptionPrice, type ProductOption } from '@/lib/options'

type Category = { id: number; name: string }
type Product = {
  id: number; category_id: number; name: string; description: string
  image: string; price: number; options?: ProductOption[]
  isCoins?: boolean; coinRubles?: number
}


const COIN_RATE = 5
const COIN_MIN_RUB = 1
const COIN_MAX_RUB = 6000

function clampRub(v: number) {
  return Math.min(COIN_MAX_RUB, Math.max(COIN_MIN_RUB, Math.round(v || COIN_MIN_RUB)))
}

function CoinsOffer({ onBuy }: { onBuy: (rubles: number) => void }) {
  const [rubles, setRubles] = useState(100)
  const coins = rubles * COIN_RATE
  const setAmount = (v: number) => setRubles(clampRub(v))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-5 sm:p-6 mb-5 sm:mb-6 overflow-hidden relative"
    >
      <div className="absolute -right-16 -top-20 w-48 h-48 rounded-full bg-pink-soft/40 blur-3xl" />
      <div className="relative grid lg:grid-cols-[1fr_360px] gap-5 lg:gap-8 items-center">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink to-pink-deep text-white flex items-center justify-center shadow-lg shadow-pink/25">
              <Coins size={25} />
            </div>
            <div>
              <div className="text-xs text-ink/50 uppercase tracking-wider">Игровая валюта</div>
              <h3 className="font-display text-2xl sm:text-3xl leading-tight">Коины Elytrix</h3>
            </div>
          </div>
          <p className="text-sm text-ink/60 max-w-2xl">
            Выберите сумму ползунком или впишите вручную. Курс фиксированный: <b>1 ₽ = {COIN_RATE} коинов</b>.
          </p>
        </div>

        <div className="bg-white/70 rounded-2xl p-4 border border-pink-soft/40">
          <div className="flex items-center justify-between text-xs text-ink/45 mb-2">
            <span>{COIN_MIN_RUB} ₽</span>
            <span>{COIN_MAX_RUB} ₽</span>
          </div>
          <input
            type="range"
            min={COIN_MIN_RUB}
            max={COIN_MAX_RUB}
            value={rubles}
            onChange={e => setAmount(Number(e.target.value))}
            className="w-full accent-pink"
          />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <label>
              <span className="text-xs text-ink/50">Отдаёте</span>
              <div className="mt-1 flex items-center rounded-xl border border-pink-soft/60 bg-white overflow-hidden">
                <input
                  type="number"
                  min={COIN_MIN_RUB}
                  max={COIN_MAX_RUB}
                  value={rubles}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 outline-none font-bold bg-transparent"
                />
                <span className="pr-3 text-ink/45 font-semibold">₽</span>
              </div>
            </label>
            <label>
              <span className="text-xs text-ink/50">Получаете</span>
              <div className="mt-1 flex items-center rounded-xl border border-pink-soft/60 bg-pink-soft/15 overflow-hidden">
                <input
                  type="number"
                  min={COIN_RATE}
                  max={COIN_MAX_RUB * COIN_RATE}
                  step={COIN_RATE}
                  value={coins}
                  onChange={e => setAmount(Math.ceil(Number(e.target.value) / COIN_RATE))}
                  className="w-full px-3 py-2 outline-none font-bold bg-transparent text-pink-deep"
                />
                <span className="pr-3 text-ink/45 font-semibold">коинов</span>
              </div>
            </label>
          </div>
          <button
            onClick={() => onBuy(rubles)}
            className="mt-4 w-full bg-pink text-white py-3 rounded-xl font-semibold hover:bg-pink-deep transition shadow-lg shadow-pink/25"
          >
            Купить {coins} коинов
          </button>
        </div>
      </div>
    </motion.div>
  )
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
            <CoinsOffer onBuy={(rubles) => setBuy({ id: 0, category_id: active || 0, name: 'Коины', description: '', image: '', price: rubles, isCoins: true, coinRubles: rubles })} />

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
