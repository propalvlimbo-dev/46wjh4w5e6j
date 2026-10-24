'use client'

import { useMemo } from 'react'
import { Palette } from 'lucide-react'

export type TitleStyle = {
  text: string
  mode: 'gradient'
  color: string
  color2: string
}

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
  const valid = value.text.length > 0 && value.text.length <= 10 && SAFE_TITLE.test(value.text)
  const previewStyle = useMemo(() => ({
      backgroundImage: `linear-gradient(90deg, ${value.color}, ${value.color2}, ${value.color})`,
      backgroundSize: '100% 100%',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    } as React.CSSProperties), [value])

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

      <button type="button" onClick={() => update({ color: '#f05a9a', color2: '#8b5cf6' })} className="w-full rounded-lg border border-pink-soft/60 px-2 py-2 text-xs font-semibold text-ink/70 hover:border-pink">Градиент Обычный</button>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-[11px] text-ink/50">Цвет 1<input type="color" value={value.color} onChange={e => update({ color: e.target.value })} className="mt-1 h-10 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></label>
        <label className="text-[11px] text-ink/50">Цвет 2<input type="color" value={value.color2} onChange={e => update({ color2: e.target.value })} className="mt-1 h-10 w-full cursor-pointer rounded-lg border-0 bg-transparent" /></label>
      </div>

      <div className="rounded-xl bg-[#202027] px-3 py-3 text-left text-sm text-white/90 font-mono">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Предпросмотр чата</div>
        <div>
          <span className="text-white/80">{player || 'Player'}</span>{' '}
          <span className="inline-block px-1 font-mono font-black text-base tracking-wide [paint-order:stroke_fill] [-webkit-text-stroke:1px_#09090b] [text-shadow:2px_2px_0_#09090b,-2px_0_0_#09090b,0_2px_0_#09090b]" style={previewStyle}>{value.text || 'Титул'}</span>
          <span className="text-white/60">: сообщение</span>
        </div>
      </div>
    </div>
  )
}
