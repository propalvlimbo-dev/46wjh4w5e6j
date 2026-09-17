export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}