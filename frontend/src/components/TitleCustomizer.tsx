'use client'

import { useMemo, useState } from 'react'
import { Check, Palette, Sparkles } from 'lucide-react'

export type TitleStyle = {
  text: string
  mode: 'solid' | 'gradient' | 'shine'
  color: string
  color2: string
}

const PRESETS = [
  { name: 'Розовый', color: '#f05a9a', color2: '#ff9bc5' },
  { name: 'Золотой', color: '#f59e0b', color2: '#fde68a' },
  { name: 'Изумрудный', color: '#10b981', color2: '#6ee7b7' },
  { name: 'Небесный', color: '#0ea5e9', color2: '#93c5fd' },
  { name: 'Фиолетовый', color: '#8b5cf6', color2: '#d8b4fe' },
  { name: 'Красный', color: '#ef4444', color2: '#fca5a5' },
]

const SAFE_TITLE = /^[А-Яа-яЁёA-Za-z0-9]*$/

export default function TitleCustomizer({
  player,
  value,
  onChange,
}: {
  player: string
  value: TitleStyle
  onChange: (value: TitleStyle) => void
}) {
  const [customColors, setCustomColors] = useState(false)
  const valid = value.text.length > 0 && value.text.length <= 10 && SAFE_TITLE.test(value.text)
  const previewStyle = useMemo(() => {
    if (value.mode === 'solid') return { color: value.color }
    return {
      backgroundImage: `linear-gradient(90deg, ${value.color}, ${value.color2}, ${value.color})`,
      backgroundSize: value.mode === 'shine' ? '220% 100%' : '100% 100%',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    } as React.CSSProperties
  }, [value])

  const update = (patch: Partial<TitleStyle>) => onChange({ ...value, ...patch })

  return (
    <div className="rounded-2xl border border-pink-soft/60 bg-white/65 p-4 sm:p-5 space-y-4">
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

      <div className="flex gap-2">
        {(['solid', 'gradient', 'shine'] as const).map(mode => (
          <button
            key={mode}
            type="button"
            onClick={() => update({ mode })}
            className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition ${value.mode === mode ? 'border-pink bg-pink-soft/40 text-pink-deep' : 'border-pink-soft/50 text-ink/60 hover:border-pink'}`}
          >
            {mode === 'solid' ? 'Цвет' : mode === 'gradient' ? 'Градиент' : 'Переливание'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map(preset => {
          const selected = value.color === preset.color && value.color2 === preset.color2
          return (
            <button
              type="button"
              key={preset.name}
              onClick={() => update({ color: preset.color, color2: preset.color2 })}
              className={`relative rounded-xl border p-2 text-left transition ${selected ? 'border-pink bg-pink-soft/30' : 'border-pink-soft/50 hover:border-pink'}`}
            >
              <span className="block h-5 rounded-md" style={{ background: `linear-gradient(90deg, ${preset.color}, ${preset.color2})` }} />
              <span className="mt-1 block truncate text-[10px] text-ink/60">{preset.name}</span>
              {selected && <Check size={13} className="absolute right-1.5 top-1.5 rounded-full bg-white text-pink" />}
            </button>
          )
        })}
      </div>

      <button type="button" onClick={() => setCustomColors(v => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-pink-deep hover:text-pink">
        <Sparkles size={14} /> {customColors ? 'Скрыть HEX-цвета' : 'Настроить свои HEX-цвета'}
      </button>
      {customColors && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[11px] text-ink/50">Цвет 1<input type="color" value={value.color} onChange={e => update({ color: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></label>
          <label className="text-[11px] text-ink/50">Цвет 2<input type="color" value={value.color2} onChange={e => update({ color2: e.target.value })} className="mt-1 h-9 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></label>
        </div>
      )}

      <div className="rounded-xl bg-[#202027] px-3 py-3 text-left text-sm text-white/80">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Предпросмотр чата</div>
        <div>
          <span className="text-white/80">{player || 'Player'}</span>{' '}
          <span className="font-semibold" style={previewStyle}>{value.text || 'Титул'}</span>
          <span className="text-white/60">: сообщение</span>
        </div>
      </div>
    </div>
  )
}
