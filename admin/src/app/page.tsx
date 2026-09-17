'use client'
import { useState } from 'react'

export default function Login() {
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async () => {
    setLoading(true); setErr('')
    try {
      const r = await fetch('/safdjuhos8dfuahj/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      })
      if (!r.ok) { setErr('Неверный пароль'); setLoading(false); return }
      location.href = '/safdjuhos8dfuahj/dashboard'
    } catch { setErr('Ошибка сети'); setLoading(false) }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-4">
        <div className="text-lg font-semibold text-center">Elytrix</div>
        <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && login()} placeholder="Пароль" className="inp" />
        {err && <div className="text-red-400 text-xs text-center">{err}</div>}
        <button onClick={login} disabled={loading || !pass} className="btn btn-primary w-full justify-center">{loading ? '...' : 'Войти'}</button>
      </div>
    </main>
  )
}