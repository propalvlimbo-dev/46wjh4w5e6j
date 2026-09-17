'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Trash2, Plus, Pencil, X, GripVertical, ImagePlus, Loader2, Terminal } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { parseDuration } from '@/lib/duration'

type ProductOption = {
  id?: number
  label: string
  price: number
  days: number
  hours?: number
  dur?: string
  duration_text?: string
  commands: string
  active?: boolean
}
type Product = { id: number; category_id: number; name: string; price: number; image: string; commands: string; description: string; active: boolean; sort: number; options?: ProductOption[] }
type Category = { id: number; name: string }

const empty = { category_id: 0, name: '', description: '', image: '', price: 0, commands: '', active: true, options: [] as ProductOption[] }

const blankOption = (): ProductOption => ({ id: 0, label: '', price: 0, days: 0, hours: 0, dur: '', duration_text: '', commands: '', active: true })

// Картинки храним в БД, поэтому перед загрузкой ужимаем на канвасе:
// максимум 640px по длинной стороне и ~800КБ — проходит лимиты nginx (1m) и fiber (1MB).
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => { URL.revokeObjectURL(url); res(im) }
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('не удалось открыть файл')) }
    im.src = url
  })
}
const canvasBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('canvas'))), type, q))

async function prepImage(file: File): Promise<Blob> {
  const img = await loadImage(file)
  const side = (max: number) => {
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    return [Math.max(1, Math.round(img.naturalWidth * s)), Math.max(1, Math.round(img.naturalHeight * s))] as const
  }
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  const draw = (max: number) => {
    const [w, h] = side(max)
    c.width = w; c.height = h
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
  }
  draw(640)
  if (file.type === 'image/png') {
    const b = await canvasBlob(c, 'image/png')
    if (b.size <= 800_000) return b
  }
  for (const q of [0.92, 0.85, 0.75]) {
    const b = await canvasBlob(c, 'image/jpeg', q)
    if (b.size <= 800_000) return b
  }
  draw(480)
  for (const q of [0.85, 0.75]) {
    const b = await canvasBlob(c, 'image/jpeg', q)
    if (b.size <= 800_000) return b
  }
  throw new Error('картинку не удалось сжать — возьми файл меньше или проще')
}

// одна строка «срока»: расшифровка парсера для подсказки
function durationHint(text?: string) {
  const raw = (text || '').trim()
  if (!raw) return { cls: 'text-muted/70', tip: 'без срока' }
  const d = parseDuration(raw)
  if (d.forever) return { cls: 'text-emerald-400', tip: 'навсегда' }
  if (!d.ok) return { cls: 'text-amber-400', tip: 'не распознан' }
  const human = d.days > 0 ? `${d.days} дн.` : `${d.hours} ч`
  return { cls: 'text-emerald-400', tip: `${human} · %dur%=${d.dur}` }
}

export default function Products() {
  const [list, setList] = useState<Product[]>([])
  const [cats, setCats] = useState<Category[]>([])
  const [form, setForm] = useState<any>({ ...empty })
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [cmdOpen, setCmdOpen] = useState<boolean[]>([])

  const load = () => {
    fetch('/safdjuhos8dfuahj/products', { credentials: 'include' }).then(r => r.json()).then(d => setList(d || []))
    fetch('/safdjuhos8dfuahj/categories', { credentials: 'include' }).then(r => r.json()).then(d => setCats(d || []))
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    const options = ((form.options || []) as ProductOption[])
      .filter(x => (x.label || '').trim() && +x.price > 0)
      .map(x => {
        const d = parseDuration(x.duration_text || '')
        return {
          id: x.id || 0,
          label: x.label.trim(),
          price: +x.price,
          days: d.hours ? d.days : 0,
          hours: d.hours,
          dur: d.dur,
          duration_text: (x.duration_text || '').trim(),
          commands: x.commands || '',
          active: x.active !== false
        }
      })
    const payload = { ...form, options }
    if (editId) await api(`/safdjuhos8dfuahj/products/${editId}`, { method: 'PUT', body: JSON.stringify(payload) })
    else await api('/safdjuhos8dfuahj/products', { method: 'POST', body: JSON.stringify(payload) })
    setOpen(false); setEditId(null); setForm({ ...empty }); load()
  }
  const edit = (p: Product) => {
    const options = (p.options || []).map(o => ({ ...o, duration_text: o.duration_text || (o.days ? `${o.days} дней` : '') }))
    setForm({ ...p, options }); setEditId(p.id)
    setCmdOpen(options.map(o => !!(o.commands || '').trim()))
    setOpen(true)
  }
  const setOption = (i: number, patch: Partial<ProductOption>) => {
    const arr = ((form.options || []) as ProductOption[]).slice()
    arr[i] = { ...arr[i], ...patch }
    setForm({ ...form, options: arr })
  }
  const addOption = () => {
    const arr = ((form.options || []) as ProductOption[]).slice()
    arr.push(blankOption())
    setCmdOpen(o => [...o, false])
    setForm({ ...form, options: arr })
  }
  const delOption = (i: number) => {
    const arr = ((form.options || []) as ProductOption[]).slice()
    arr.splice(i, 1)
    setCmdOpen(o => o.filter((_, n) => n !== i))
    setForm({ ...form, options: arr })
  }
  const upload = async (file: File | undefined | null) => {
    if (!file) return
    setUploading(true)
    try {
      const blob = await prepImage(file)
      const fd = new FormData()
      fd.append('file', blob, blob.type === 'image/png' ? 'image.png' : 'image.jpg')
      const r = await fetch('/safdjuhos8dfuahj/upload-image', { method: 'POST', body: fd, credentials: 'include' })
      if (!r.ok) throw new Error((await r.text()) || 'ошибка загрузки')
      const d = await r.json()
      setForm((f: any) => ({ ...f, image: d.url }))
    } catch (e: any) {
      alert('Не удалось загрузить картинку: ' + (e?.message || e))
    } finally {
      setUploading(false)
    }
  }
  const del = async (id: number) => {
    if (!confirm('Удалить товар? Заказы с ним останутся в истории.')) return
    try { await api(`/safdjuhos8dfuahj/products/${id}`, { method: 'DELETE' }) } catch (e: any) { alert(String(e?.message || e)); return }
    load()
  }

  const reorder = async (categoryId: number, newIds: number[]) => {
    const otherProducts = list.filter(p => p.category_id !== categoryId).sort((a, b) => a.sort - b.sort).map(p => p.id)
    const fullOrder = [...newIds, ...otherProducts]
    await fetch('/safdjuhos8dfuahj/products/reorder', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: fullOrder })
    })
    load()
  }

  const grouped = (cats || []).map(c => ({
    ...c,
    products: (list || []).filter(p => p.category_id === c.id).sort((a, b) => a.sort - b.sort || b.price - a.price)
  }))

  const opts = (form.options || []) as ProductOption[]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Товары</h1>
        <button onClick={() => { setForm({ ...empty }); setEditId(null); setCmdOpen([]); setOpen(true) }} className="btn btn-primary">
          <Plus size={14} /> Добавить
        </button>
      </div>

      {grouped.length === 0 && <div className="text-muted text-sm">Сначала создайте категории</div>}

      {grouped.map(g => (
        <CategoryBlock
          key={g.id}
          category={g}
          onEdit={edit}
          onDelete={del}
          onReorder={(ids) => reorder(g.id, ids)}
        />
      ))}

      {open && (
        <Modal onClose={() => { setOpen(false); setEditId(null) }} title={editId ? 'Редактировать товар' : 'Новый товар'} wide
          pill={editId ? (
            <button onClick={() => setForm({ ...form, active: !form.active })} title="Показывать в магазине"
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${form.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-hover text-muted'}`}>
              {form.active ? '● в магазине' : '○ скрыт'}
            </button>
          ) : undefined}
        >
          <div className="space-y-2.5">
            <div className="grid grid-cols-[1fr_130px_96px] gap-2">
              <Field label="Название">
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="inp h-8" placeholder="VIP-статус" />
              </Field>
              <Field label="Категория">
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: +e.target.value })} className="inp h-8">
                  <option value={0}>—</option>
                  {(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Цена, ₽">
                <input type="number" value={form.price || ''} onChange={e => setForm({ ...form, price: +e.target.value })} className="inp h-8" placeholder="149" />
              </Field>
            </div>

            <Field label="Картинка" hint="клик по квадрату — загрузить файл (PNG/JPG/WebP, сожмём сами)">
              <div className="flex gap-2 items-center">
                <label className="w-8 h-8 rounded-md border border-border bg-bg overflow-hidden flex items-center justify-center cursor-pointer shrink-0 hover:border-pink/60 transition relative" title="Загрузить файл">
                  {uploading
                    ? <Loader2 size={13} className="animate-spin text-pink" />
                    : form.image
                      ? <img src={form.image} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.opacity = '0.15' }} />
                      : <ImagePlus size={13} className="text-muted/50" />}
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                <input value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} className="inp h-8 flex-1" placeholder="URL картинки — или загрузите файл слева" />
              </div>
            </Field>

            <Field label="Описание" hint="1-я строка — под названием в карточке · остальные — в окне покупки">
              <textarea
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="inp h-[72px] resize-none text-xs leading-relaxed"
                placeholder={'Привилегия VIP: кит, /fly, префикс\nПолный список команд — /viper\nДействует на всех мирах'}
              />
            </Field>

            <Field label="Команды через ;" hint="%player% · <#FF6FA5>цвет</#>">
              <textarea
                value={form.commands}
                onChange={e => setForm({ ...form, commands: e.target.value })}
                className="inp h-10 resize-none font-mono text-[11px]"
                placeholder="lp user %player% parent add vip;give %player% diamond 5"
              />
            </Field>

            <div className="rounded-lg border border-border p-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[11px] font-medium">
                  Варианты оплаты <span className="text-muted/60">({opts.length})</span>
                </div>
                <div className="text-[10px] text-muted/60">пусто — разовая покупка по цене</div>
              </div>
              {opts.length > 0 && (
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-0.5 mb-1.5">
                  {opts.map((o, i) => {
                    const hint = durationHint(o.duration_text)
                    const hasCmd = !!(o.commands || '').trim()
                    const expanded = cmdOpen[i] || hasCmd
                    return (
                      <div key={i} className={`rounded-md border px-1.5 py-1 text-xs ${o.active !== false ? 'border-pink/40 bg-pink/[0.04]' : 'border-border opacity-55'}`}>
                        <div className="grid grid-cols-[minmax(0,1.1fr)_52px_minmax(0,1fr)_auto_auto] items-center gap-1.5">
                          <input value={o.label} onChange={e => setOption(i, { label: e.target.value })} className="inp h-7 text-xs" placeholder="название" />
                          <input type="number" min="1" value={o.price || ''} onChange={e => setOption(i, { price: +e.target.value })} className="inp h-7 text-xs" placeholder="₽" />
                          <input value={o.duration_text || ''} onChange={e => setOption(i, { duration_text: e.target.value })} className="inp h-7 text-xs" placeholder={`срок: 2 недели${o.duration_text ? ' · ' + hint.tip : ''}`} />
                          <button
                            onClick={() => setCmdOpen(c => c.map((v, n) => (n === i ? !v : v)))}
                            title="Команды для этого срока"
                            className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 transition ${hasCmd || cmdOpen[i] ? 'text-pink bg-pink/10' : 'text-muted/60 hover:text-text hover:bg-hover'}`}
                          >
                            <Terminal size={11} />
                          </button>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => setOption(i, { active: o.active === false })}
                              title={o.active !== false ? 'выключить' : 'включить'}
                              className={`h-7 w-7 rounded-md text-[8px] font-bold transition ${o.active !== false ? 'bg-pink text-white' : 'bg-hover text-muted'}`}
                            >
                              {o.active !== false ? 'ON' : 'OFF'}
                            </button>
                            <button onClick={() => delOption(i)} title="удалить" className="h-7 w-7 rounded-md text-muted/70 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        {expanded && (
                          <div className="mt-1">
                            <textarea
                              value={o.commands || ''}
                              onChange={e => setOption(i, { commands: e.target.value })}
                              className="inp h-11 resize-none font-mono text-[11px]"
                              placeholder="lp user %player% parent add vip temp %dur% (пусто = команды товара)"
                            />
                            <div className={`text-[10px] mt-0.5 ${hint.cls}`}>{hint.tip} · в командах доступны %days%, %hours%, %dur% (готовый формат LuckPerms)</div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <button onClick={addOption} className="w-full h-7 rounded-md border border-dashed border-border text-[11px] text-muted hover:text-pink hover:border-pink/50 transition flex items-center justify-center gap-1">
                <Plus size={11} /> вариант оплаты
              </button>
            </div>

            <button onClick={save} className="btn btn-primary w-full h-9 justify-center">
              {editId ? 'Сохранить' : 'Создать товар'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function CategoryBlock({ category, onEdit, onDelete, onReorder }: {
  category: any
  onEdit: (p: Product) => void
  onDelete: (id: number) => void
  onReorder: (ids: number[]) => void
}) {
  const [items, setItems] = useState<Product[]>(category.products)

  useEffect(() => { setItems(category.products) }, [category.products])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(x => x.id === active.id)
    const newIndex = items.findIndex(x => x.id === over.id)
    const newItems = arrayMove(items, oldIndex, newIndex)
    setItems(newItems)
    onReorder(newItems.map(x => x.id))
  }

  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-muted mb-2 px-1">{category.name}</h2>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {items.length === 0 && <div className="px-4 py-6 text-muted text-xs text-center">Нет товаров</div>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(x => x.id)} strategy={verticalListSortingStrategy}>
            {items.map(p => (
              <SortableRow key={p.id} product={p} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </section>
  )
}

function SortableRow({ product: p, onEdit, onDelete }: {
  product: Product
  onEdit: (p: Product) => void
  onDelete: (id: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto'
  }
  const activeOpts = (p.options || []).filter(o => o.active !== false)

  return (
    <div ref={setNodeRef} style={style as any}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-hover/40 transition group bg-card">
      <button {...attributes} {...listeners}
        className="text-muted hover:text-text cursor-grab active:cursor-grabbing touch-none">
        <GripVertical size={14} />
      </button>
      <div className="w-9 h-9 rounded-md bg-bg border border-border overflow-hidden flex items-center justify-center shrink-0">
        {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : <ImagePlus size={12} className="text-muted/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate flex items-center gap-1.5">
          {p.name}
          {activeOpts.length > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink/10 text-pink font-medium shrink-0">
              {activeOpts.slice(0, 3).map(x => x.label).join(' / ')}{activeOpts.length > 3 ? ` +${activeOpts.length - 3}` : ''}
            </span>
          )}
        </div>
        <div className="text-muted text-xs truncate">{p.description || p.commands}</div>
      </div>
      {!p.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Скрыт</span>}
      <div className="text-pink text-sm font-medium w-24 text-right shrink-0">
        {activeOpts.length > 0 ? <>от {Math.min(...activeOpts.map(x => x.price))} ₽</> : <>{p.price} ₽</>}
      </div>
      <button onClick={() => onEdit(p)} className="p-1.5 text-muted hover:text-text opacity-0 group-hover:opacity-100 transition"><Pencil size={13} /></button>
      <button onClick={() => onDelete(p.id)} className="p-1.5 text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition"><Trash2 size={13} /></button>
    </div>
  )
}

function Field({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label className="text-[11px] text-muted shrink-0">{label}</label>
        {hint && <span className="text-[10px] text-muted/50 truncate text-right">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Modal({ children, onClose, title, wide, pill }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean; pill?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`bg-card border border-border rounded-lg w-full ${wide ? 'max-w-xl' : 'max-w-md'} max-h-[92vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center gap-2 px-3.5 py-2.5 border-b border-border shrink-0">
          <div className="text-sm font-semibold">{title}</div>
          <div className="flex items-center gap-2">
            {pill}
            <button onClick={onClose}><X size={16} className="text-muted hover:text-text" /></button>
          </div>
        </div>
        <div className="p-3.5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
