const BASE = '/safdjuhos8dfuahj'
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith('/api/') ? BASE + path.replace('/api', '') : path
  const r = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) }
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}