'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'
import {
  X, Tag, Wallet, Check, AlertCircle, QrCode, Bitcoin, Coins,
  Loader2, ArrowLeft, ExternalLink, CheckCircle2, ChevronRight
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { colorize } from '@/lib/colorize'
import { fmtDuration, hasOptions, type ProductOption } from '@/lib/options'

type MethodDef = { id: string; label: string; desc: string; icon: any; currency?: string }

// Способы оплаты — правь под то, что включено в AnyPay
const MAIN_METHODS: MethodDef[] = [
  { id: 'sbp', label: 'СБП', desc: 'QR-код', icon: QrCode },
  { id: 'funpay', label: 'FunPay', desc: 'В особых случаях', icon: FunPayIcon },
]

// Криптовалюты
const CRYPTO_METHODS: MethodDef[] = [
  { id: 'ton', label: 'TON', desc: 'Toncoin', icon: Coins },
  { id: 'btc', label: 'BTC', desc: 'Bitcoin', icon: Bitcoin },
  { id: 'eth', label: 'ETH', desc: 'Ethereum', icon: Coins },
]

const ALL_METHODS = [...MAIN_METHODS, ...CRYPTO_METHODS]
const COIN_RATE = 10
const COIN_MIN_RUB = 1
const COIN_MAX_RUB = 6000
const FUNPAY_URL = 'https://funpay.com/users/7785488/'
const FUNPAY_WARNING = 'У метода FunPay отключена автовыдача, ждать выдачи можно от 10 минут до 1 дня.'


function CoinIcon({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br from-pink to-pink-deep text-white flex items-center justify-center shadow-lg shadow-pink/25 ${className}`}>
      <Coins size={36} strokeWidth={2.4} />
    </div>
  )
}

function FunPayIcon({ size = 20 }: { size?: number; className?: string }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md border border-ink/10 bg-ink/10 text-ink/45 font-display font-bold leading-none"
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.62)) }}
    >
      F
    </span>
  )
}

const QR_HINTS: Record<string, string> = {
  sbp: 'Наведите камеру банковского приложения на QR-код — оплата подтвердится автоматически.',
  funpay: 'QR-код откроет страницу оплаты через FunPay.',
}

function resolveMethod(id: string): MethodDef | undefined {
  return ALL_METHODS.find(m => m.id === id)
}

function qrHintFor(method: string): string {
  if (QR_HINTS[method]) return QR_HINTS[method]
  return 'QR-код откроет страницу оплаты. Следуйте инструкциям на ней.'
}

type PayInfo = {
  url: string
  order: string
  pay_id: string
  amount: number
  coins?: number
  payment_data?: any
}

export default function BuyModal({ product, onClose }: { product: any; onClose: () => void }) {
  const isCoins = !!product?.isCoins
  const options: ProductOption[] = (product?.options || []) as ProductOption[]
  const selectable = !isCoins && hasOptions(product)
  const [coinRubles, setCoinRubles] = useState<number>(Math.min(COIN_MAX_RUB, Math.max(COIN_MIN_RUB, Number(product?.coinRubles || 100))))
  const [optionId, setOptionId] = useState<number>(options[0]?.id || 0)
  const [name, setName] = useState('')
  const [promo, setPromo] = useState('')
  const [showPromo, setShowPromo] = useState(false)
  const [promoState, setPromoState] = useState<{ ok?: boolean; discount?: number; error?: string; checking?: boolean }>({})
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [method, setMethod] = useState('')          // '' = способ ещё не выбран
  const [methodsOpen, setMethodsOpen] = useState(false)
  const [step, setStep] = useState<'form' | 'pay' | 'done'>('form')
  const [pay, setPay] = useState<PayInfo | null>(null)
  const [issued, setIssued] = useState(false)
  const payingRef = useRef(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    if (isCoins || !promo) { setPromoState({}); return }
    setPromoState({ checking: true })
    const t = setTimeout(() => {
      fetch(`/api/check-promo?code=${encodeURIComponent(promo)}&product_id=${product.id}`)
        .then(r => r.json())
        .then(d => setPromoState(d.ok ? { ok: true, discount: d.discount } : { ok: false, error: d.error }))
        .catch(() => setPromoState({ ok: false, error: 'Ошибка сети' }))
    }, 400)
    return () => clearTimeout(t)
  }, [promo, product.id, isCoins])

  // Автоматическая проверка статуса оплаты, пока пользователь на экране QR.
  // Основной источник — наша БД; verify дергаем редко как запасной путь.
  useEffect(() => {
    if (step !== 'pay' || !pay?.pay_id) return
    let stop = false
    let verifyBusy = false
    let lastVerify = 0
    const done = (d: any) => {
      if (!stop && d && (d.status === 'paid' || d.status === 'issued')) {
        setIssued(d.status === 'issued')
        setStep('done')
      }
    }
    const load = () => {
      const q = pay.order ? `order=${pay.order}` : `pay_id=${pay.pay_id}`
      fetch(`/api/payment/status?${q}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(done)
        .catch(() => {})
    }
    const verify = () => {
      const now = Date.now()
      if (verifyBusy || now - lastVerify < 15000) return
      verifyBusy = true
      lastVerify = now
      fetch(`/api/payment/verify?pay_id=${pay.pay_id}`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(done)
        .catch(() => {})
        .finally(() => { verifyBusy = false })
    }
    const tick = () => { load(); verify() }
    const i = setInterval(tick, 3000)
    tick()
    return () => { stop = true; clearInterval(i) }
  }, [step, pay])

  const selOpt = options.find(o => o.id === optionId) || options[0]
  const coinAmount = coinRubles * COIN_RATE
  const basePrice = isCoins ? coinRubles : (selectable && selOpt ? selOpt.price : product.price)
  const finalPrice = !isCoins && promoState.ok && promoState.discount ? Math.floor(basePrice * (100 - promoState.discount) / 100) : basePrice
  const optionLabel = selectable && selOpt ? selOpt.label : ''

  const startPay = async () => {
    const def = resolveMethod(method)
    if ((def?.id || method) === 'funpay') {
      setMsg(FUNPAY_WARNING)
      window.open(FUNPAY_URL, '_blank', 'noopener,noreferrer')
      return
    }
    if (payingRef.current) return
    payingRef.current = true
    setLoading(true); setMsg(null)
    const mcur = def?.currency || ''
    try {
      const r = await fetch(isCoins ? '/api/create-coins-payment' : '/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCoins
          ? { player: name, amount: coinRubles, method: def?.id || method, method_currency: mcur }
          : { player: name, product_id: product.id, option_id: selectable ? (selOpt?.id || 0) : 0, promo: promoState.ok ? promo : '', method: def?.id || method, method_currency: mcur })
      })
      const data = await r.json()
      if (!r.ok || !data.url) {
        setMsg(data.error || 'Ошибка создания платежа')
        return
      }
      setPay({ url: data.url, order: data.order, pay_id: data.pay_id, amount: data.amount, coins: data.coins, payment_data: data.payment_data })
      setStep('pay')
    } catch {
      setMsg('Ошибка сети')
    } finally {
      setLoading(false)
      payingRef.current = false
    }
  }

  const sel = resolveMethod(method)
  const canPay = name.length >= 3 && name.length <= 16 && method !== '' && !loading
  const qrHint = qrHintFor(method)
  const setCoinAmountRub = (v: number) => setCoinRubles(Math.min(COIN_MAX_RUB, Math.max(COIN_MIN_RUB, Math.round(v || COIN_MIN_RUB))))

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-0 sm:p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          onClick={e => e.stopPropagation()}
          className={`bg-white sm:rounded-3xl w-full shadow-2xl relative overflow-hidden flex flex-col ${
            step === 'form' ? 'sm:max-w-4xl h-[100dvh] sm:h-[560px]' : 'sm:max-w-md max-h-[92dvh]'
          }`}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center z-20 transition"
          >
            <X size={18} />
          </button>

          {step === 'form' && (
            <div className="grid md:grid-cols-2 flex-1 min-h-0 overflow-y-auto md:overflow-hidden modal-scroll" data-lenis-prevent>

              {/* Левая часть — товар */}
              <div className="p-5 sm:p-8 bg-gradient-to-br from-pink-soft/40 to-white flex flex-col min-h-0">
                <div className="flex items-start gap-4 mb-5 sm:mb-6 pr-10 shrink-0">
                  {isCoins ? (
                    <CoinIcon className="w-20 h-20 sm:w-24 sm:h-24 shrink-0" />
                  ) : (
                    <img
                      src={product.image || '/images/placeholder.png'}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-lg shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs text-ink/50 uppercase tracking-wider mb-1">Товар</div>
                    <div className="font-display text-xl sm:text-2xl leading-tight truncate">{product.name}</div>
                    <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                      <div className="text-pink font-bold text-lg sm:text-xl">{finalPrice} ₽</div>
                      {finalPrice !== basePrice && (
                        <div className="text-sm text-ink/40 line-through">{basePrice} ₽</div>
                      )}
                      {isCoins ? (
                        <div className="text-xs text-ink/50 font-medium">/ {coinAmount} коинов</div>
                      ) : optionLabel && (
                        <div className="text-xs text-ink/50 font-medium">/ {optionLabel.toLowerCase()}</div>
                      )}
                    </div>
                  </div>
                </div>

                {selectable && (
                  <div className="mb-5 sm:mb-6 shrink-0">
                    <div className="text-xs text-ink/50 uppercase tracking-wider mb-2">На какой срок</div>
                    <div className={`grid gap-2 ${options.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
                      {options.map(o => {
                        const active = selOpt?.id === o.id
                        return (
                          <button
                            key={o.id}
                            onClick={() => setOptionId(o.id)}
                            className={`rounded-xl border-2 px-2 py-2 text-center transition ${
                              active ? 'border-pink bg-pink-soft/30 shadow-md shadow-pink/10' : 'border-pink-soft/40 bg-white/60 hover:border-pink/50'
                            }`}
                          >
                            <div className={`text-xs font-semibold leading-tight truncate ${active ? 'text-pink-deep' : 'text-ink/70'}`}>{o.label}</div>
                            <div className={`text-[11px] mt-0.5 ${active ? 'text-pink-deep font-bold' : 'text-ink/50'}`}>{o.price} ₽</div>
                            {!!fmtDuration(o) && <div className="text-[9px] text-ink/35 leading-tight truncate">{fmtDuration(o)}</div>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {isCoins && (
                  <div className="mb-4 shrink-0 bg-white/75 rounded-2xl p-3.5 border border-pink-soft/40">
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                      <div className="text-xs text-ink/50">Курс: <b className="text-ink/70">1 ₽ = {COIN_RATE}</b></div>
                      <div className="text-xs text-pink-deep font-semibold">{coinAmount} коинов</div>
                    </div>
                    <input
                      type="range"
                      min={COIN_MIN_RUB}
                      max={COIN_MAX_RUB}
                      value={coinRubles}
                      onChange={e => setCoinAmountRub(Number(e.target.value))}
                      className="w-full accent-pink"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3">
                      <label className="block">
                        <span className="text-xs text-ink/50">Отдаёте</span>
                        <div className="mt-1 flex items-center rounded-xl border border-pink-soft/60 bg-white overflow-hidden">
                          <input
                            type="number"
                            min={COIN_MIN_RUB}
                            max={COIN_MAX_RUB}
                            value={coinRubles}
                            onChange={e => setCoinAmountRub(Number(e.target.value))}
                            className="min-w-0 w-full px-3 py-2 outline-none font-bold bg-transparent text-sm sm:text-base"
                          />
                          <span className="pr-3 text-ink/45 font-semibold">₽</span>
                        </div>
                      </label>
                      <label className="block">
                        <span className="text-xs text-ink/50">Получаете</span>
                        <div className="mt-1 flex items-center rounded-xl border border-pink-soft/60 bg-pink-soft/15 overflow-hidden">
                          <input
                            type="number"
                            min={COIN_RATE}
                            max={COIN_MAX_RUB * COIN_RATE}
                            step={COIN_RATE}
                            value={coinAmount}
                            onChange={e => setCoinAmountRub(Math.ceil(Number(e.target.value) / COIN_RATE))}
                            className="min-w-0 w-full px-3 py-2 outline-none font-bold bg-transparent text-sm sm:text-base"
                          />
                          <span className="pr-3 text-ink/45 font-semibold text-xs sm:text-sm">коинов</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                <div className="bg-white/70 rounded-2xl p-4 sm:p-5 flex flex-col flex-1 min-h-0">
                  <div className="font-semibold text-sm mb-3 shrink-0">Что вы получите:</div>
                  <div
                    data-lenis-prevent
                    className="allow-select text-sm text-ink/70 leading-relaxed whitespace-pre-line overflow-y-auto modal-scroll flex-1 pr-1 min-h-0"
                  >
                    {isCoins ? (
                      <>Коины выдаются автоматически после оплаты.<br />Сейчас выбрано: <b>{coinAmount} коинов</b> за <b>{coinRubles} ₽</b>.</>
                    ) : (() => {
                      const rest = (product.description || '').split('\n').slice(1).join('\n').trim()
                      return rest ? colorize(rest) : 'Покупка выдаётся на сервере сразу после оплаты.'
                    })()}
                  </div>
                  <div className="mt-4 pt-4 border-t border-pink-soft/40 text-xs text-ink/50 shrink-0">
                    Покупка придёт автоматически. Вы должны быть онлайн на сервере.
                  </div>
                </div>
              </div>

              {/* Правая часть — форма */}
              <div className="p-5 sm:p-8 flex flex-col min-h-0 overflow-y-auto modal-scroll" data-lenis-prevent>
                <div className="text-xs text-ink/50 uppercase tracking-wider mb-1">Шаг 1</div>
                <div className="font-display text-lg sm:text-xl mb-4">Заполните данные</div>

                <label className="text-sm font-medium text-ink/70 mb-2 block">Ваш ник в игре</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Nickname"
                  maxLength={16}
                  className="w-full bg-white border border-pink-soft/60 rounded-xl px-4 py-3 mb-4 outline-none focus:border-pink transition"
                />

                {!isCoins && (!showPromo ? (
                  <button
                    onClick={() => setShowPromo(true)}
                    className="text-sm text-pink hover:text-pink-deep font-medium flex items-center gap-1 mb-4 self-start"
                  >
                    <Tag size={14} /> У меня есть промокод
                  </button>
                ) : (
                  <div className="mb-4">
                    <label className="text-sm font-medium text-ink/70 mb-2 block">Промокод</label>
                    <div className="relative">
                      <input
                        value={promo}
                        onChange={e => setPromo(e.target.value.toUpperCase())}
                        placeholder="PROMO2026"
                        className={`w-full bg-white border rounded-xl px-4 py-3 outline-none uppercase transition pr-10 ${
                          promoState.ok
                            ? 'border-green-500'
                            : promoState.error
                            ? 'border-red-400'
                            : 'border-pink-soft/60 focus:border-pink'
                        }`}
                      />
                      {promoState.ok && <Check size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500" />}
                      {promoState.error && <AlertCircle size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400" />}
                    </div>
                    {promoState.ok && (
                      <div className="text-xs text-green-600 mt-2 font-medium">✓ Скидка {promoState.discount}% применена</div>
                    )}
                    {promoState.error && (
                      <div className="text-xs text-red-500 mt-2">{promoState.error}</div>
                    )}
                  </div>
                ))}

                <div className="text-xs text-ink/50 uppercase tracking-wider mb-1">Шаг 2</div>
                <div className="font-display text-lg sm:text-xl mb-3">Способ оплаты</div>

                {/* Компактная кликабельная строка — выбор способа */}
                <button
                  onClick={() => setMethodsOpen(true)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                    sel ? 'border-pink bg-pink-soft/20' : 'border-dashed border-pink-soft/70 bg-white hover:border-pink'
                  }`}
                >
                  {sel ? (
                    <>
                      <sel.icon size={22} className="text-pink shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">{sel.label}</div>
                        <div className="text-xs text-ink/50">{sel.desc}</div>
                      </div>
                      <Check size={18} className="text-pink shrink-0" />
                    </>
                  ) : (
                    <>
                      <Wallet size={22} className="text-ink/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">Способы оплаты</div>
                        <div className="text-xs text-ink/50">Нажмите, чтобы выбрать</div>
                      </div>
                      <ChevronRight size={18} className="text-ink/40 shrink-0" />
                    </>
                  )}
                </button>
                {!sel && (
                  <div className="text-xs text-ink/40 mt-2">Выберите способ оплаты, чтобы продолжить</div>
                )}

                {msg && (
                  <div className={`text-center text-sm my-2 font-medium ${msg === FUNPAY_WARNING ? 'text-amber-600' : 'text-red-500'}`}>
                    {msg}
                    {msg === FUNPAY_WARNING && (
                      <a href={FUNPAY_URL} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-pink hover:text-pink-deep transition">
                        Открыть FunPay <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                )}

                <button
                  disabled={!canPay}
                  onClick={startPay}
                  className="mt-auto w-full bg-pink text-white py-3.5 rounded-xl font-semibold hover:bg-pink-deep transition disabled:opacity-50 shadow-lg shadow-pink/30"
                >
                  {loading ? 'Создаём оплату...' : `Оплатить ${finalPrice} ₽`}
                </button>
              </div>
            </div>
          )}

          {step === 'pay' && pay && (
            <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center overflow-y-auto modal-scroll" data-lenis-prevent>
              <div className="text-xs text-ink/50 uppercase tracking-wider mb-2">Оплата</div>
              <div className="font-display text-xl sm:text-2xl leading-tight mb-1">{product.name}{isCoins ? ` · ${pay.coins || coinAmount} коинов` : optionLabel ? ` · ${optionLabel}` : ''}</div>
              <div className="text-pink font-bold text-2xl mb-5">{pay.amount} ₽</div>

              <div className="bg-white border-2 border-pink-soft/60 rounded-2xl p-4 mb-4 shadow-sm">
                <QRCodeSVG value={pay.url} size={200} level="M" bgColor="#ffffff" fgColor="#1f1f1f" />
              </div>

              <p className="text-sm text-ink/70 mb-1 max-w-xs">{qrHint}</p>
              <p className="text-xs text-ink/50 mb-3">Страница обновится автоматически после оплаты</p>
              <p className="text-xs text-pink font-medium mb-3 sm:hidden">На телефоне свой экран не отсканировать — нажмите кнопку «Открыть страницу оплаты».</p>

              {pay.payment_data && (pay.payment_data.bank || pay.payment_data.account) && (
                <div className="w-full max-w-sm bg-white/70 rounded-xl p-3 mb-4 text-left text-xs text-ink/70 space-y-1">
                  {pay.payment_data.bank && (
                    <div><span className="text-ink/50">Банк:</span> <span className="font-medium">{pay.payment_data.bank}</span></div>
                  )}
                  {pay.payment_data.account && (
                    <div className="break-all"><span className="text-ink/50">Реквизиты:</span> <span className="font-medium">{pay.payment_data.account}</span></div>
                  )}
                  {pay.payment_data.amount != null && (
                    <div><span className="text-ink/50">К оплате:</span> <span className="font-medium">{pay.payment_data.amount} {pay.payment_data.currency}</span></div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-ink/50 mb-5">
                <Loader2 size={16} className="animate-spin text-pink" /> Проверяем статус оплаты…
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full max-w-sm">
                <a
                  href={pay.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-pink text-white py-3 rounded-xl font-semibold hover:bg-pink-deep transition"
                >
                  Открыть страницу оплаты <ExternalLink size={16} />
                </a>
                <button
                  onClick={() => { setStep('form'); setPay(null) }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-pink-soft/60 text-ink/70 hover:bg-black/5 transition"
                >
                  <ArrowLeft size={16} /> Назад
                </button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="p-6 sm:p-8 flex flex-col items-center justify-center text-center overflow-y-auto modal-scroll" data-lenis-prevent>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.05 }}
                className="w-16 h-16 mb-6 rounded-2xl bg-green-500/15 flex items-center justify-center"
              >
                <CheckCircle2 size={32} className="text-green-600" strokeWidth={2.2} />
              </motion.div>
              <h3 className="font-display text-2xl sm:text-3xl mb-2">Оплата прошла!</h3>
              <p className="text-ink/60 text-sm mb-6 max-w-xs">
                {issued
                  ? 'Покупка уже выдана в игре. Приятной игры!'
                  : 'Покупка будет выдана в течение минуты. Будьте онлайн на сервере.'}
              </p>

              <div className="bg-white/70 rounded-2xl p-4 mb-6 w-full max-w-sm text-left text-sm">
                <div className="flex justify-between mb-2">
                  <span className="text-ink/50">Товар</span>
                  <span className="font-medium">{product.name}</span>
                </div>
                {isCoins && (
                  <div className="flex justify-between mb-2">
                    <span className="text-ink/50">Коины</span>
                    <span className="font-medium">{pay?.coins || coinAmount}</span>
                  </div>
                )}
                {optionLabel && (
                  <div className="flex justify-between mb-2">
                    <span className="text-ink/50">Срок</span>
                    <span className="font-medium">{optionLabel}</span>
                  </div>
                )}
                <div className="flex justify-between mb-2">
                  <span className="text-ink/50">Игрок</span>
                  <span className="font-medium">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink/50">Сумма</span>
                  <span className="font-bold text-pink">{finalPrice} ₽</span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="bg-pink text-white px-7 py-3 rounded-xl font-semibold hover:bg-pink-deep transition"
              >
                Отлично
              </button>
            </div>
          )}

          {/* Всплывающее окно выбора способа оплаты */}
          {methodsOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMethodsOpen(false)}
              className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.94, y: 16, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.94, y: 16, opacity: 0 }}
                transition={{ type: 'spring', damping: 24, stiffness: 320 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-2xl w-full max-w-[300px] sm:max-w-xs shadow-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-pink-soft/40">
                  <div className="font-display text-base">Способ оплаты</div>
                  <button
                    onClick={() => setMethodsOpen(false)}
                    className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-3 max-h-[65vh] overflow-y-auto modal-scroll" data-lenis-prevent>
                  <div className="grid grid-cols-2 gap-2">
                    {MAIN_METHODS.map(m => {
                      const Icon = m.icon
                      const active = method === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setMethod(m.id); setMethodsOpen(false) }}
                          className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition ${
                            active ? 'border-pink bg-pink-soft/30' : 'border-pink-soft/40 hover:border-pink/40'
                          }`}
                        >
                          <Icon size={20} className={active ? 'text-pink' : 'text-ink/40'} />
                          <div className="font-semibold text-xs leading-tight">{m.label}</div>
                          <div className="text-[10px] text-ink/50 leading-tight">{m.desc}</div>
                          {active && <Check size={15} className="absolute top-1.5 right-1.5 text-pink" />}
                        </button>
                      )
                    })}
                  </div>

                  <div className="text-[10px] text-ink/40 uppercase tracking-wider px-1 pt-3 pb-1.5">Криптовалюты</div>

                  <div className="grid grid-cols-3 gap-2">
                    {CRYPTO_METHODS.map(m => {
                      const Icon = m.icon
                      const active = method === m.id
                      return (
                        <button
                          key={m.id}
                          onClick={() => { setMethod(m.id); setMethodsOpen(false) }}
                          className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-2.5 text-center transition ${
                            active ? 'border-pink bg-pink-soft/30' : 'border-pink-soft/40 hover:border-pink/40'
                          }`}
                        >
                          <Icon size={20} className={active ? 'text-pink' : 'text-ink/40'} />
                          <div className="font-semibold text-xs leading-tight">{m.label}</div>
                          <div className="text-[10px] text-ink/50 leading-tight">{m.desc}</div>
                          {active && <Check size={15} className="absolute top-1.5 right-1.5 text-pink" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
