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

const COINS_CATEGORY_ID = -1
const COIN_RATE = 10
const COIN_MIN_RUB = 1
const COIN_MAX_RUB = 6000

function clampRub(v: number) {
  return Math.min(COIN_MAX_RUB, Math.max(COIN_MIN_RUB, Math.round(v || COIN_MIN_RUB)))
}

function CoinIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-pink to-pink-deep text-white flex items-center justify-center shadow-lg shadow-pink/25 ${className}`}>
      <Coins size={24} strokeWidth={2.4} />
    </div>
  )
}

function CoinsOffer({ onBuy }: { onBuy: (rubles: number) => void }) {
  const [rubles, setRubles] = useState(100)
  const coins = rubles * COIN_RATE
  const setAmount = (v: number) => setRubles(clampRub(v))
  const setCoins = (v: number) => setAmount(Math.ceil((v || COIN_RATE) / COIN_RATE))

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl glass rounded-3xl p-4 sm:p-6 lg:p-7 overflow-hidden relative"
    >
      <div className="absolute -right-20 -top-20 w-56 h-56 rounded-full bg-pink-soft/35 blur-3xl" />
      <div className="relative grid lg:grid-cols-[minmax(0,1fr)_450px] gap-5 lg:gap-8 items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-4">
            <CoinIcon className="w-12 h-12 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-ink/50 uppercase tracking-wider">Игровая валюта</div>
              <h3 className="font-display text-2xl sm:text-3xl leading-tight">Коины Elytrix</h3>
            </div>
          </div>
          <p className="text-base sm:text-lg text-ink/75 font-medium leading-relaxed max-w-2xl">
            Пополняй свой баланс коинами и покупай любые предметы с /shop.
          </p>
          <div className="mt-4 inline-flex rounded-full bg-pink-soft/25 px-3 py-1 text-xs font-semibold text-pink-deep">
            1 ₽ = {COIN_RATE} коинов
          </div>
        </div>

        <div className="rounded-2xl bg-white/70 border border-pink-soft/40 p-4 sm:p-5 shadow-sm">
          <input
            type="range"
            min={COIN_MIN_RUB}
            max={COIN_MAX_RUB}
            value={rubles}
            onChange={e => setAmount(Number(e.target.value))}
            className="w-full accent-pink"
          />
          <div className="flex justify-between text-[11px] text-ink/35 mt-1">
            <span>{COIN_MIN_RUB} ₽</span>
            <span>{COIN_MAX_RUB} ₽</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
            <label>
              <span className="text-xs text-ink/50">Отдаёте</span>
              <div className="mt-1 flex items-center rounded-xl border border-pink-soft/60 bg-white/80 overflow-hidden">
                <input
                  type="number"
                  min={COIN_MIN_RUB}
                  max={COIN_MAX_RUB}
                  value={rubles}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="min-w-0 w-full px-3 py-2.5 outline-none font-bold bg-transparent text-sm sm:text-base"
                />
                <span className="pr-3 text-ink/45 font-semibold">₽</span>
              </div>
            </label>
            <label>
              <span className="text-xs text-ink/50">Получаете</span>
              <div className="mt-1 flex items-center rounded-xl border border-pink-soft/60 bg-white/80 overflow-hidden">
                <input
                  type="number"
                  min={COIN_RATE}
                  max={COIN_MAX_RUB * COIN_RATE}
                  step={COIN_RATE}
                  value={coins}
                  onChange={e => setCoins(Number(e.target.value))}
                  className="min-w-0 w-full px-3 py-2.5 outline-none font-bold bg-transparent text-pink-deep text-sm sm:text-base"
                />
                <span className="pr-3 text-ink/45 font-semibold text-xs sm:text-sm">коинов</span>
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
    api<Category[]>('/api/categories')
      .then(c => { const list = c || []; setCats(list); setActive(list[0]?.id ?? COINS_CATEGORY_ID) })
      .catch(() => { setActive(COINS_CATEGORY_ID) })
    api<Product[]>('/api/products').then(p => setProducts(p || [])).catch(() => {})
  }, [])

  const allCats = cats.length > 0
    ? [cats[0], { id: COINS_CATEGORY_ID, name: 'Коины' }, ...cats.slice(1)]
    : [{ id: COINS_CATEGORY_ID, name: 'Коины' }]
  const filtered = (products || []).filter(p => p.category_id === active)

  return (
    <section id="shop" className="px-4 sm:px-8 py-16 sm:py-20 relative">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl mb-8 sm:mb-10">Магазин</h2>

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 md:gap-8">
          <aside className="md:sticky md:top-28 h-fit">
            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
              {allCats.map(c => (
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
            {active === COINS_CATEGORY_ID ? (
              <CoinsOffer onBuy={(rubles) => setBuy({ id: 0, category_id: COINS_CATEGORY_ID, name: 'Коины', description: '', image: '', price: rubles, isCoins: true, coinRubles: rubles })} />
            ) : (
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
            )}
          </div>
        </div>
      </div>
      {buy && <BuyModal product={buy} onClose={() => setBuy(null)} />}
    </section>
  )
}
