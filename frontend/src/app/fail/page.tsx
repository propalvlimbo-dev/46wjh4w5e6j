'use client'
import { motion } from 'framer-motion'
import { XCircle } from 'lucide-react'
import Link from 'next/link'

export default function FailPage() {
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
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/15 flex items-center justify-center"
        >
          <XCircle size={32} className="text-red-500" strokeWidth={2.2} />
        </motion.div>

        <h1 className="font-display text-3xl sm:text-4xl mb-3">Оплата не прошла</h1>
        <p className="text-ink/60 text-sm mb-8 leading-relaxed">
          Что-то пошло не так. Деньги не были списаны.<br />
          Попробуйте ещё раз или свяжитесь с поддержкой.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="bg-pink text-white px-7 py-3 rounded-xl font-semibold hover:bg-pink-deep transition"
          >
            На главную
          </Link>
          <a
            href="https://t.me/Elytrix_Help"
            target="_blank"
            rel="noopener noreferrer"
            className="glass px-7 py-3 rounded-xl font-semibold hover:bg-white/80 transition"
          >
            Написать в поддержку
          </a>
        </div>
      </motion.div>
    </div>
  )
}