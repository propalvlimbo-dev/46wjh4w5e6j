'use client'

import { useMemo } from 'react'
import { Palette } from 'lucide-react'

export type TitleStyle = {
  text: string
  mode: 'gradient' | 'solid'
  color: string
  color2: string
}

const SAFE_TITLE = /^[А-Яа-яЁёA-Za-z0-9]*$/

function rgb(hex: string) {
  const value = hex.replace('#', '')
  return {
    r: parseInt(value.slice(0, 2), 16) || 0,
    g: parseInt(value.slice(2, 4), 16) || 0,
    b: parseInt(value.slice(4, 6), 16) || 0,
  }
}

function gradientText(text: string, first: string, second: string) {
  const a = rgb(first)
  const b = rgb(second)
  const chars = Array.from(text)
  return chars.map((char, index) => {
    const t = chars.length <= 1 ? 0 : index / (chars.length - 1)
    const color = `rgb(${Math.round(a.r + (b.r - a.r) * t)}, ${Math.round(a.g + (b.g - a.g) * t)}, ${Math.round(a.b + (b.b - a.b) * t)})`
    return <span key={`${char}-${index}`} style={{ color }}>{char}</span>
  })
}

export default function TitleCustomizer({
  player,
  value,
  onChange,
}: {
  player: string
  value: TitleStyle
  onChange: (value: TitleStyle) => void
}) {
  const valid = value.text.length > 0 && value.text.length <= 10 && SAFE_TITLE.test(value.text)
  const titlePreview = useMemo(() => value.mode === 'gradient'
    ? gradientText(value.text || 'Титул', value.color, value.color2)
    : <span style={{ color: value.color }}>{value.text || 'Титул'}</span>, [value])

  const update = (patch: Partial<TitleStyle>) => onChange({ ...value, ...patch })

  return (
    <div className="rounded-2xl border border-pink-soft/60 bg-white/65 p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Palette size={18} className="text-pink" />
        <div>
          <div className="font-semibold text-sm">Настройте свой титул</div>
          <div className="text-xs text-ink/50">До 10 символов · только буквы и цифры</div>
        </div>
      </div>

      <div>
        <input
          value={value.text}
          maxLength={10}
          onChange={e => {
            const next = e.target.value
            if (SAFE_TITLE.test(next)) update({ text: next })
          }}
          placeholder="Например: Герой"
          className="w-full rounded-xl border border-pink-soft/60 bg-white px-3 py-2.5 text-sm outline-none focus:border-pink"
        />
        <div className={`text-[11px] mt-1 ${valid ? 'text-ink/40' : 'text-red-500'}`}>
          {value.text.length}/10 {value.text.length === 0 ? 'Введите титул' : !valid ? 'Недопустимый текст' : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => update({ mode: 'gradient' })} className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${value.mode === 'gradient' ? 'border-pink bg-pink-soft/30 text-pink-deep' : 'border-pink-soft/60 text-ink/70 hover:border-pink'}`}>Градиент</button>
        <button type="button" onClick={() => update({ mode: 'solid' })} className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${value.mode === 'solid' ? 'border-pink bg-pink-soft/30 text-pink-deep' : 'border-pink-soft/60 text-ink/70 hover:border-pink'}`}>Обычный</button>
      </div>

      <div className={`grid gap-3 ${value.mode === 'gradient' ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <label className="text-[11px] text-ink/50">Цвет 1<input type="color" value={value.color} onChange={e => update({ color: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></label>
        {value.mode === 'gradient' && <label className="text-[11px] text-ink/50">Цвет 2<input type="color" value={value.color2} onChange={e => update({ color2: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></label>}
      </div>

      <div className="relative overflow-hidden rounded-xl min-h-[104px] bg-[#202027] px-3 py-3 text-left text-[13px] text-white">
        <div className="absolute inset-0 bg-[url('/images/minecraft-chat-bg.png')] bg-cover bg-center scale-110 blur-[5px] opacity-70" />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10">
          <div className="mb-4 text-[10px] uppercase tracking-wider text-white/55">Предпросмотр чата</div>
          <div className="font-minecraft text-[13px] leading-6 font-bold [text-shadow:2px_2px_0_#000,-1px_0_0_#000]">
            <span className="text-white">{player || 'Player'}</span>{' '}
            <span className="font-minecraft font-black tracking-wide [paint-order:stroke_fill] [-webkit-text-stroke:1px_#09090b] [text-shadow:2px_2px_0_#09090b,-1px_0_0_#09090b]">{titlePreview}</span>
            <span className="text-white/90">: сообщение</span>
          </div>
        </div>
      </div>
    </div>
  )
}
