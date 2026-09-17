import React from 'react'

// Парсит <#RRGGBB>текст<#RRGGBB> или <#RRGGBB>текст</#>
// Возвращает массив React-элементов
export function colorize(text: string): React.ReactNode[] {
  if (!text) return []
  const parts: React.ReactNode[] = []
  const regex = /<#([0-9a-fA-F]{6})>([\s\S]*?)(?:<#\1>|<\/#>|<\/color>)/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0

  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(<React.Fragment key={key++}>{text.slice(last, m.index)}</React.Fragment>)
    parts.push(
      <span key={key++} style={{ color: '#' + m[1] }}>
        {m[2]}
      </span>
    )
    last = regex.lastIndex
  }
  if (last < text.length) parts.push(<React.Fragment key={key++}>{text.slice(last)}</React.Fragment>)
  return parts
}

// Убирает все теги цвета — для превью в карточке (первая строка)
export function stripColors(text: string): string {
  if (!text) return ''
  return text.replace(/<#[0-9a-fA-F]{6}>/g, '').replace(/<\/#>/g, '').replace(/<\/color>/g, '')
}