'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

const rules = [
  { title: '1.1', text: 'Незнание правил не освобождает вас от ответственности;' },
  { title: '1.2', text: 'Начав играть на наших серверах, Вы автоматически подтверждаете своё согласие с данным сводом правил;' },
  { title: '1.3', text: 'Администратор вправе наказать игрока по причине, не указанной в настоящих правилах;' },
  { title: '1.4', text: 'Администрация не несет ответственности за временную или постоянную невозможность игры на сервере конкретным лицом или группой лиц;' },
  { title: '1.5', text: 'Администрация не несет ответственности за потерю игровых ценностей в следствии нарушения работоспособности сервера или его плагинов;' },
  { title: '1.6', text: 'Администрация не гарантирует работоспособность сервера, а также сохранность информации на нем и продолжение работы над ним;' },
  { title: '1.7', text: 'Администрация сервера не гарантирует надёжную работу в предоставлении услуг и сервисов, а также не несёт ответственность за ущерб, который может быть причинён пользователям вследствие сбоев в линиях связи, ошибочного использования предоставляемых услуг, дефектов программного обеспечения или других действий, которые могут привести к возникновению нежелательных ситуаций;' },
  { title: '1.8', text: 'Игроки обязаны соблюдать все правила;' },
  { title: '1.9', text: 'Администрация ведет логи всех действий игроков на сервере и всех сообщений чата;' },
  { title: '1.10', text: 'Администрация имеет право корректировать данный свод правил без уведомления игрока;' },
  { title: '1.11', text: 'Оскорбление, провоцирование администрации запрещено.' }
]

export default function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
              <div className="font-display text-base sm:text-lg">Правила проекта</div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center transition shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div data-lenis-prevent className="allow-select overflow-y-auto modal-scroll px-5 sm:px-7 py-5 sm:py-6 space-y-3">
              <div className="font-semibold text-sm sm:text-base mb-3">1. Основные правила</div>

              {rules.map((r, i) => (
                <div key={i}>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-pink font-semibold text-xs">{r.title}</span>
                  </div>
                  <div className="text-xs text-ink/60 leading-relaxed pl-4">
                    {r.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-5 sm:px-7 py-3 sm:py-4 border-t border-pink-soft/30 text-[11px] sm:text-xs text-ink/40 text-center">
              Список правил будет дополняться
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}