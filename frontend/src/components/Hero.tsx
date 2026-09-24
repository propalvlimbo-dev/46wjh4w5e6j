'use client'
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

const SERVER_IP = 'mc.elytrix.pw'

export default function Hero() {
  const [entered, setEntered] = useState(false)
  const [copied, setCopied] = useState(false)
  const mx = useMotionValue(0)
  const x = useSpring(mx, { stiffness: 60, damping: 15 })
  const shift = useTransform(x, [-1, 1], [-40, 40])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      mx.set(nx)
    }
    window.addEventListener('mousemove', onMove)
    const t = setTimeout(() => setEntered(true), 1300)
    return () => { window.removeEventListener('mousemove', onMove); clearTimeout(t) }
  }, [mx])

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(SERVER_IP)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = SERVER_IP
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="relative min-h-screen flex items-center px-4 sm:px-8 pt-28 sm:pt-32 pb-10 overflow-hidden">
      <div className="blob bg-pink-soft w-[400px] sm:w-[500px] h-[400px] sm:h-[500px] -top-40 -left-40" />
      <div className="blob bg-pink w-[400px] sm:w-[500px] h-[400px] sm:h-[500px] bottom-[-100px] right-[-80px]" />

      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-center relative z-10 w-full">
        <div className="text-center md:text-left order-2 md:order-1">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-tight"
          >
            <span className="gradient-text">Elytrix</span> — гриферский сервер Minecraft
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-5 sm:mt-6 text-base sm:text-lg text-ink/70 max-w-md mx-auto md:mx-0"
          >
            Элитрикс — Minecraft сервер с гриферским режимом, кланами, PvP, топами, коинами и мгновенной выдачей покупок. IP: mc.elytrix.pw.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-7 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center md:justify-start"
          >
            <a href="#shop" className="bg-pink text-white px-7 py-3 rounded-xl font-semibold hover:bg-pink-deep transition text-center">
              В магазин
            </a>
            <button
              onClick={copyIP}
              className="glass px-7 py-3 rounded-xl font-semibold hover:bg-white/80 transition"
            >
              Скопировать IP
            </button>
          </motion.div>
        </div>

        <motion.div style={{ x: shift }} className="relative flex justify-center items-center order-1 md:order-2">
          {!entered ? (
            <motion.img
              key="fly"
              src="/images/hero.png"
              alt="Elytrix — гриферский Minecraft сервер"
              initial={{ opacity: 0, scale: 0.2, y: -400, rotate: -25 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
              transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
              className="drop-shadow-2xl w-full max-w-[320px] sm:max-w-[500px] md:max-w-[650px]"
            />
          ) : (
            <motion.img
              key="float"
              src="/images/hero.png"
              alt="Elytrix — гриферский Minecraft сервер"
              animate={{ y: [0, -18, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="drop-shadow-2xl w-full max-w-[320px] sm:max-w-[500px] md:max-w-[650px]"
            />
          )}
        </motion.div>
      </div>

      {/* Toast уведомление */}
<AnimatePresence>
  {copied && (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-6 right-6 z-50 bg-white/90 backdrop-blur border border-pink-soft/40 rounded-full px-4 py-2 flex items-center gap-2 text-xs shadow-lg"
    >
      <Check size={13} className="text-pink" strokeWidth={2.5} />
      <span className="text-ink/60">IP скопирован</span>
      <span className="font-mono text-ink/80">{SERVER_IP}</span>
    </motion.div>
  )}
</AnimatePresence>
    </section>
  )
}