'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, LogIn, ShoppingCart, HelpCircle } from 'lucide-react'
import { useEffect } from 'react'

const steps = [
  {
    icon: Download,
    title: '1. Скачайте Minecraft',
    text: 'Наш сервер работает на версиях 1.16.5 - 1.21.4. Подойдёт как лицензионная версия, так и пиратская (TLauncher, LegacyLauncher и др.).'
  },
  {
    icon: LogIn,
    title: '2. Зайдите на сервер',
    text: 'Откройте Minecraft → Сетевая игра → Добавить сервер. В поле "Адрес сервера" введите: mc.elytrix.pw. Нажмите "Готово" и подключайтесь!'
  },
  {
    icon: ShoppingCart,
    title: '3. Как купить донат?',
    text: 'Перейдите в раздел "Магазин" на сайте, выберите нужный товар и нажмите "Купить". Введите свой игровой ник (тот же, с которым заходите на сервер) и оплатите удобным способом. Покупка выдастся автоматически в течение минуты — вы должны быть онлайн на сервере.'
  },
  {
    icon: HelpCircle,
    title: '4. Возникли проблемы?',
    text: 'Если что-то не работает или покупка не пришла — напишите в поддержку: Telegram @Elytrix_Help или на почту elytrixhelp@mail.ru. Обычно отвечаем в течение часа.'
  }
]

export default function HowToPlayModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-3 sm:p-4"
        >
          <motion.div
            initial={{ scale: 0.95, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-pink-soft/30">
              <div className="font-display text-base sm:text-lg">Как играть?</div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div data-lenis-prevent className="allow-select overflow-y-auto modal-scroll px-5 sm:px-7 py-5 sm:py-6 space-y-5">
              {steps.map((s, i) => {
                const Icon = s.icon
                return (
                  <div key={i} className="flex gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-pink-soft/40 flex items-center justify-center">
                      <Icon size={18} className="text-pink" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm sm:text-base mb-1">{s.title}</div>
                      <div className="text-xs sm:text-sm text-ink/60 leading-relaxed">{s.text}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-5 sm:px-7 py-3 sm:py-4 border-t border-pink-soft/30 text-[11px] sm:text-xs text-ink/40 text-center">
              Приятной игры на Elytrix!
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}