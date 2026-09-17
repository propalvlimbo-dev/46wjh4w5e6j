'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import RulesModal from './RulesModal'
import HowToPlayModal from './HowToPlayModal'
import Tops from './Tops'

export default function Header() {
  const [open, setOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [topsOpen, setTopsOpen] = useState(false)

  const links: { label: string; href?: string; onClick?: () => void }[] = [
    { label: 'Магазин', href: '#shop' },
    { label: 'Топы', onClick: () => { setTopsOpen(true); setOpen(false) } },
    { label: 'Как играть?', onClick: () => { setHowOpen(true); setOpen(false) } },
    { label: 'Правила', onClick: () => { setRulesOpen(true); setOpen(false) } }
  ]

  return (
    <>
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-40"
      >
        <div className="max-w-7xl mx-auto glass rounded-full px-5 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="font-display text-xl sm:text-2xl gradient-text">Elytrix</div>

          <nav className="hidden md:flex gap-10 text-sm font-medium">
            {links.map(l => (
              l.href ? (
                <a key={l.label} href={l.href} className="hover:text-pink transition">{l.label}</a>
              ) : (
                <button key={l.label} onClick={l.onClick} className="hover:text-pink transition">{l.label}</button>
              )
            ))}
          </nav>

          <button
            onClick={() => setOpen(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/50 transition"
            aria-label="Меню"
          >
            <Menu size={20} />
          </button>

          <div className="hidden md:block w-4" />
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 md:hidden"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center p-5 border-b border-pink-soft/30">
                <div className="font-display text-xl gradient-text">Elytrix</div>
                <button
                  onClick={() => setOpen(false)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition"
                >
                  <X size={18} />
                </button>
              </div>
              <nav className="flex flex-col p-5 gap-1">
                {links.map(l => (
                  l.href ? (
                    <a
                      key={l.label}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="px-4 py-3 rounded-xl text-base font-medium hover:bg-pink-soft/20 hover:text-pink transition"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <button
                      key={l.label}
                      onClick={l.onClick}
                      className="px-4 py-3 rounded-xl text-base font-medium hover:bg-pink-soft/20 hover:text-pink transition text-left"
                    >
                      {l.label}
                    </button>
                  )
                ))}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <HowToPlayModal open={howOpen} onClose={() => setHowOpen(false)} />
      <Tops open={topsOpen} onClose={() => setTopsOpen(false)} />
    </>
  )
}