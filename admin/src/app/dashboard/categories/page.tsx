'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Trash2, Plus } from 'lucide-react'

export default function Categories() {
  const [list, setList] = useState<any[]>([])
  const [name, setName] = useState('')

  const load = () => fetch('/safdjuhos8dfuahj/categories', { credentials: 'include' }).then(r => r.json()).then(d => setList(d || []))
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!name.trim()) return
    await api('/safdjuhos8dfuahj/categories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
    setName(''); load()
  }
  const del = async (id: number) => {
    if (!confirm('Удалить категорию? Все товары в ней тоже удалятся.')) return
    try { await api(`/safdjuhos8dfuahj/categories/${id}`, { method: 'DELETE' }) } catch (e: any) { alert(String(e?.message || e)); return }
    load()
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold">Категории</h1>

      <div className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} placeholder="Название" className="inp" />
        <button onClick={create} className="btn btn-primary"><Plus size={14} />Добавить</button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {list.length === 0 && <div className="px-4 py-6 text-muted text-xs text-center">Нет категорий</div>}
        {list.map(c => (
          <div key={c.id} className="flex items-center px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-hover/40 group">
            <div className="flex-1 text-sm">{c.name}</div>
            <button onClick={() => del(c.id)} className="p-1.5 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}