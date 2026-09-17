'use client'
import { useEffect, useState } from 'react'
import { Eye, AlertTriangle, Clock, Wrench, Timer } from 'lucide-react'

export default function SettingsPage() {
  const [s, setS] = useState<any>({})
  const [mins, setMins] = useState('60')
  const [addMins, setAddMins] = useState('30')
  const [schedIn, setSchedIn] = useState('10')
  const [schedDur, setSchedDur] = useState('60')
  const [ips, setIps] = useState('')
  const [myIp, setMyIp] = useState('')
  const [showDanger, setShowDanger] = useState(false)
  const [clearConfirm, setClearConfirm] = useState('')

  const load = () => fetch('/safdjuhos8dfuahj/settings', { credentials: 'include' })
    .then(r => r.json()).then(d => { setS(d); setIps(d.allowed_ips || '') })

  useEffect(() => {
    load()
    fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => setMyIp(d.ip)).catch(() => {})
  }, [])

  const save = async (key: string, value: string) => {
    await fetch('/safdjuhos8dfuahj/settings', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    })
    load()
  }

  const post = async (path: string, body: any) => {
    await fetch('/safdjuhos8dfuahj' + path, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    load()
  }

  const enable = () => post('/maintenance/enable', { minutes: +mins })
  const disable = () => save('maintenance_until', '')
  const addTime = () => post('/maintenance/extend', { minutes: +addMins })
  const schedule = () => post('/maintenance/schedule', { minutes: +schedIn, duration: +schedDur })
  const cancelSched = () => save('maintenance_scheduled_at', '')

  const clearOrders = async () => {
    if (clearConfirm !== 'DELETE ALL ORDERS') return
    const r = await fetch('/safdjuhos8dfuahj/clear-orders', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: clearConfirm })
    })
    if (r.ok) { alert('Очищено'); setClearConfirm(''); setShowDanger(false) }
  }

  // считаем остаток от серверного времени, а не от часов браузера
  const serverNow = s.server_time ? new Date(s.server_time).getTime() : Date.now()
  const isActive = s.maintenance_until && new Date(s.maintenance_until).getTime() > serverNow
  const remaining = isActive ? Math.max(0, Math.ceil((new Date(s.maintenance_until).getTime() - serverNow) / 60000)) : 0
  const isScheduled = s.maintenance_scheduled_at && new Date(s.maintenance_scheduled_at).getTime() > serverNow
  const schedRemain = isScheduled ? Math.max(0, Math.ceil((new Date(s.maintenance_scheduled_at).getTime() - serverNow) / 60000)) : 0
  const serverIp = s.client_ip || ''
  const addIp = (ip: string) => { const arr = ips.split(',').map(x => x.trim()).filter(Boolean); if (ip && !arr.includes(ip)) setIps([...arr, ip].join(', ')) }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Настройки</h1>
        <p className="text-muted text-sm mt-1">Управление режимом сайта</p>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted mb-3 px-1 flex items-center gap-1.5">
          <Wrench size={12} /> Технические работы
        </h2>
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          {isActive ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-pink animate-pulse" />
                <div className="text-sm font-semibold text-pink">Активны</div>
                <div className="text-xs text-muted">· осталось ~{Math.floor(remaining / 60)}ч {remaining % 60}м</div>
              </div>
              <div className="text-xs text-muted">Окончание: {new Date(s.maintenance_until).toLocaleString('ru')}</div>
              <div className="flex gap-2 items-center pt-1">
                <span className="text-xs text-muted">Продлить:</span>
                <input type="number" value={addMins} onChange={e => setAddMins(e.target.value)} min="1" className="inp w-20 text-center" />
                <span className="text-xs text-muted">мин</span>
                <button onClick={addTime} className="btn btn-secondary text-xs">Добавить</button>
              </div>
              <div className="flex flex-wrap gap-2 items-center pt-1">
                <button onClick={disable} className="btn btn-danger">Выключить сейчас</button>
                <a
                  href={(process.env.NEXT_PUBLIC_SITE_URL || '') + '/?maintpreview=1'}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary text-xs"
                  title="Откроет сайт в режиме «глазами посетителя»: увидите именно тот экран тех. работ, что видят игроки"
                >
                  <Eye size={12} /> Как это видит игрок
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted text-xs">Длительность:</span>
                <input type="number" value={mins} onChange={e => setMins(e.target.value)} min="1" className="inp w-24 text-center" />
                <span className="text-muted text-xs">минут</span>
              </div>
              <div className="flex gap-1.5">
                {[15, 30, 60, 120].map(m => (
                  <button key={m} onClick={() => setMins(String(m))} className="btn btn-secondary text-xs">{m}м</button>
                ))}
              </div>
              <button onClick={enable} className="btn btn-primary">Включить сейчас</button>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted mb-3 px-1 flex items-center gap-1.5">
          <Timer size={12} /> Запланировать тех.работы
        </h2>
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          {isScheduled ? (
            <>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-pink" />
                <div className="text-sm font-semibold">До начала: ~{Math.floor(schedRemain / 60)}ч {schedRemain % 60}м</div>
              </div>
              <div className="text-xs text-muted">Начало: {new Date(s.maintenance_scheduled_at).toLocaleString('ru')}</div>
              <div className="text-xs text-muted">Длительность: {s.maintenance_scheduled_duration || 60} мин</div>
              <div className="text-xs text-yellow-400/80 bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2.5">
                За 3 минуты до начала все покупки будут заблокированы
              </div>
              <button onClick={cancelSched} className="btn btn-danger">Отменить</button>
            </>
          ) : (
            <>
              <div className="text-xs text-muted">Через сколько минут начать</div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-muted">Начать через:</span>
                <input type="number" value={schedIn} onChange={e => setSchedIn(e.target.value)} min="1" className="inp w-20 text-center" />
                <span className="text-xs text-muted">мин</span>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-muted">Длительность:</span>
                <input type="number" value={schedDur} onChange={e => setSchedDur(e.target.value)} min="1" className="inp w-20 text-center" />
                <span className="text-xs text-muted">мин</span>
              </div>
              <button onClick={schedule} className="btn btn-primary">Запланировать</button>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-muted mb-3 px-1">Разрешённые IP</h2>
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="text-xs text-muted">Эти IP увидят сайт во время тех.работ (можно через запятую или с новой строки). Совпадение проверяется по X-Real-IP, X-Forwarded-For и прямому соединению — поддержка IPv6 включена.</div>
          {serverIp && (
            <div className="text-xs text-muted">
              IP, как его видит сервер: <span className="text-pink font-mono">{serverIp}</span>
              <button onClick={() => addIp(serverIp)} className="ml-2 text-pink hover:underline">добавить</button>
            </div>
          )}
          {myIp && myIp !== serverIp && (
            <div className="text-xs text-muted">
              IP браузера (api.ipify.org, IPv4): <span className="text-muted-foreground/80 font-mono">{myIp}</span>
              <button onClick={() => addIp(myIp)} className="ml-2 text-pink hover:underline">добавить</button>
              <span className="ml-1 text-yellow-400/80">— может не совпадать с тем, что видит сервер</span>
            </div>
          )}
          <textarea value={ips} onChange={e => setIps(e.target.value.replace(/\n/g, ','))} placeholder="127.0.0.1, 88.147.xxx.xxx" className="inp h-16 resize-none" />
          <button onClick={() => save('allowed_ips', ips)} className="btn btn-primary">Сохранить</button>
          <div className="text-[11px] text-muted/80 pt-1 border-t border-border/60">
            Как это работает: при совпадении IP браузеру выдаётся bypass-cookie на 7 дней (обход переживёт смену IP),
            а пока вы залогинены в админке — тех. работы автоматически обходятся на всех страницах сайта.
          </div>
        </div>
      </section>

      <div className="pt-16">
        {!showDanger ? (
          <button onClick={() => setShowDanger(true)} className="text-xs text-muted/40 hover:text-muted transition">Опасная зона</button>
        ) : (
          <section>
            <h2 className="text-xs uppercase tracking-wider text-red-400 mb-3 px-1 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Опасная зона
            </h2>
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 space-y-3">
              <div className="text-sm font-medium text-red-400">Удалить все покупки</div>
              <div className="text-xs text-muted">Это действие безвозвратно удалит ВСЕ покупки.<br />Введите <b className="font-mono text-red-400">DELETE ALL ORDERS</b> для подтверждения.</div>
              <input value={clearConfirm} onChange={e => setClearConfirm(e.target.value)} placeholder="DELETE ALL ORDERS" className="inp font-mono" />
              <div className="flex gap-2">
                <button onClick={clearOrders} disabled={clearConfirm !== 'DELETE ALL ORDERS'} className="btn btn-danger disabled:opacity-40">Удалить всё</button>
                <button onClick={() => { setShowDanger(false); setClearConfirm('') }} className="btn btn-secondary">Отмена</button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}