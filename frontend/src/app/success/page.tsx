'use client'
import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'

function SuccessInner() {
  const params = useSearchParams()
  const orderID = params.get('order') || ''
  const payID = params.get('pay_id') || ''
  const [state, setState] = useState<{ status?: string; player?: string; product?: string; price?: number; loading: boolean }>({ loading: true })

  const statusRef = useRef<string>('')

  useEffect(() => {
    if (!orderID && !payID) { setState({ loading: false }); return }
    let stop = false
    let verifyBusy = false
    let lastVerify = 0
    const q = orderID ? `order=${orderID}` : `pay_id=${payID}`
    const done = (s?: string) => s === 'issued' || s === 'paid'
    const apply = (d: any) => {
      if (stop) return
      const next = d?.status || ''
      // Не откатываем UI назад, если медленный verify вернул старый pending
      // после того, как status уже увидел issued/paid.
      if (done(statusRef.current) && next === 'pending') return
      statusRef.current = next
      setState({ ...d, loading: false })
    }
    const load = () => {
      fetch(`/api/payment/status?${q}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(apply)
        .catch(() => { if (!stop) setState({ loading: false }) })
    }
    // Verify — только запасной путь, если callback задержался. Статус БД
    // опрашиваем всегда, чтобы экран не зависел от медленного AnyPay API.
    const verify = () => {
      const now = Date.now()
      if (!payID || verifyBusy || done(statusRef.current) || now - lastVerify < 15000) return
      verifyBusy = true
      lastVerify = now
      fetch(`/api/payment/verify?pay_id=${payID}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.status) apply(d); load() })
        .catch(() => {})
        .finally(() => { verifyBusy = false })
    }
    load()
    verify()
    const i = setInterval(() => {
      load()
      if (statusRef.current === 'pending' || !statusRef.current) verify()
    }, 3000)
    return () => { stop = true; clearInterval(i) }
  }, [orderID, payID])

  const done = state.status === 'issued' || state.status === 'paid'
  const waiting = state.status === 'pending' || !state.status

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-bg relative overflow-hidden">
      <div className="blob bg-pink-soft w-[400px] sm:w-[600px] h-[400px] sm:h-[600px] -top-40 -left-40" />
      <div className="blob bg-pink w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] bottom-[-100px] right-[-80px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 text-center max-w-md w-full glass rounded-3xl p-8 sm:p-10"
      >
        {done ? (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-green-500/15 flex items-center justify-center"
            >
              <CheckCircle2 size={32} className="text-green-600" strokeWidth={2.2} />
            </motion.div>
            <h1 className="font-display text-3xl sm:text-4xl mb-3">Оплата прошла</h1>
            <p className="text-ink/60 text-sm mb-6">
              {state.status === 'issued'
                ? 'Покупка выдана в игре. Приятной игры!'
                : 'Покупка будет выдана в течение минуты.'}
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-pink-soft/40 flex items-center justify-center">
              <Clock size={30} className="text-pink" strokeWidth={2.2} />
            </div>
            <h1 className="font-display text-3xl sm:text-4xl mb-3">Ожидаем подтверждение</h1>
            <p className="text-ink/60 text-sm mb-6">
              {waiting ? 'Платёж обрабатывается. Это займёт несколько секунд.' : 'Проверяем статус...'}
            </p>
          </>
        )}

        {state.product && (
          <div className="bg-white/60 rounded-2xl p-4 mb-6 text-left">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-ink/50">Товар</span>
              <span className="font-medium">{state.product}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-ink/50">Игрок</span>
              <span className="font-medium">{state.player}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink/50">Сумма</span>
              <span className="font-bold text-pink">{state.price} ₽</span>
            </div>
          </div>
        )}

        <Link
          href="/"
          className="inline-block bg-pink text-white px-7 py-3 rounded-xl font-semibold hover:bg-pink-deep transition"
        >
          На главную
        </Link>
      </motion.div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  )
}