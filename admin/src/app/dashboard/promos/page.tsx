'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Trash2, Plus, X } from 'lucide-react'

export default function Promos() {
  const [list, setList] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ code: '', discount: 10, max_uses: 0, product_id: '', expires_at: '' })
  const [products, setProducts] = useState<any[]>([])

  const load = () => {
    fetch('/safdjuhos8dfuahj/promos', { credentials: 'include' }).then(r => r.json()).then(d => setList(d || []))
    fetch('/safdjuhos8dfuahj/products', { credentials: 'include' }).then(r => r.json()).then(d => setProducts(d || []))
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    await api('/safdjuhos8dfuahj/promos', {
      method: 'POST',
      body: JSON.stringify({ ...form, discount: +form.discount, max_uses: +form.max_uses, product_id: form.product_id ? +form.product_id : null })
    })
    setOpen(false); setForm({ code: '', discount: 10, max_uses: 0, product_id: '', expires_at: '' }); load()
  }
  const del = async (id: number) => {
    if (!confirm('Удалить?')) return
    await api(`/safdjuhos8dfuahj/promos/${id}`, { method: 'DELETE' }); load()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Промокоды</h1>
        <button onClick={() => setOpen(true)} className="btn btn-primary"><Plus size={14} />Создать</button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {list.length === 0 && <div className="px-4 py-6 text-muted text-xs text-center">Нет промокодов</div>}
        {list.map((p: any) => (
          <div key={p.id} className="flex items-center gap-4 px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-hover/40 group text-sm">
            <span className="font-mono font-medium text-pink">{p.code}</span>
            <span className="text-muted text-xs">−{p.discount}%</span>
            <span className="text-muted text-xs">{p.used}/{p.max_uses || '∞'}</span>
            {p.expires_at && <span className="text-muted text-xs">до {new Date(p.expires_at).toLocaleDateString('ru')}</span>}
            <div className="flex-1" />
            <button onClick={() => del(p.id)} className="p-1.5 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-lg w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold">Новый промокод</div>
              <button onClick={() => setOpen(false)}><X size={16} className="text-muted hover:text-text" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div><label className="text-xs text-muted mb-1 block">Код</label>
                <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="inp uppercase" placeholder="SUMMER2026" /></div>
              <div><label className="text-xs text-muted mb-1 block">Скидка %</label>
                <input type="number" value={form.discount} onChange={e => setForm({ ...form, discount: +e.target.value })} className="inp" /></div>
              <div><label className="text-xs text-muted mb-1 block">Активаций (0 = ∞)</label>
                <input type="number" value={form.max_uses} onChange={e => setForm({ ...form, max_uses: +e.target.value })} className="inp" /></div>
              <div><label className="text-xs text-muted mb-1 block">Срок действия</label>
                <input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} className="inp" /></div>
              <div><label className="text-xs text-muted mb-1 block">Товар (необязательно)</label>
                <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} className="inp">
                  <option value="">Для всех</option>
                  {(products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
              <button onClick={create} className="btn btn-primary w-full justify-center mt-2">Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}