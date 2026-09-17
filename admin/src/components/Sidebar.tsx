'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LayoutDashboard, Package, FolderTree, Ticket, Settings } from 'lucide-react'

const links = [
  { href: '/dashboard', label: 'Обзор', icon: LayoutDashboard },
  { href: '/dashboard/products', label: 'Товары', icon: Package },
  { href: '/dashboard/categories', label: 'Категории', icon: FolderTree },
  { href: '/dashboard/promos', label: 'Промокоды', icon: Ticket },
  { href: '/dashboard/settings', label: 'Настройки', icon: Settings }
]

export default function Sidebar() {
  const path = usePathname()
  const [ok, setOk] = useState(false)

  useEffect(() => {
    const check = () => fetch('/safdjuhos8dfuahj/plugin-status', { credentials: 'include' })
      .then(r => r.json()).then(d => setOk(d.ok)).catch(() => setOk(false))
    check()
    const i = setInterval(check, 15000)
    return () => clearInterval(i)
  }, [])

  return (
    <aside className="w-56 border-r border-border flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 text-sm font-semibold tracking-tight">Elytrix</div>
      <nav className="px-2 space-y-0.5 flex-1">
        {links.map(l => {
          const Icon = l.icon
          const active = path === l.href
          return (
            <Link key={l.href} href={l.href}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition ${active ? 'bg-hover text-text' : 'text-muted hover:text-text hover:bg-hover'}`}>
              <Icon size={15} />{l.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border px-4 py-3 text-xs text-muted flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
        {ok ? 'Плагин на связи' : 'Нет связи'}
      </div>
    </aside>
  )
}