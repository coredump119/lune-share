/// <reference types="@cloudflare/workers-types" />
export interface Env {
  DB: D1Database
  IMAGES?: R2Bucket
  IMAGES_KV?: KVNamespace
  ADMIN_SECRET: string
  SESSION_SECRET: string
  SESSION_DAYS?: string
  /** 'all' (default): every viewer may bulk-export what they can see; 'admin': only the admin */
  EXPORT_FOR?: string
  /** shown on the gate, in the top bar and as the tab title */
  SITE_NAME?: string
  SITE_TAGLINE?: string
}
export type Ctx = EventContext<Env, string, { viewer?: Viewer; admin?: boolean }>
export interface Viewer { sid: string; inv: string; dev: string }

export const now = () => Date.now()
export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)
const enc = new TextEncoder()

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })
}
export const bad = (msg: string, status = 400) => json({ error: msg }, status)

export async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return b64url(new Uint8Array(sig))
}
const b64url = (u8: Uint8Array) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlStr = (s: string) => b64url(enc.encode(s))
const unb64url = (s: string) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0))) }

/** token = base64url(json).hmac */
export async function sign(secret: string, payload: Record<string, unknown>) {
  const body = b64urlStr(JSON.stringify(payload))
  return `${body}.${await hmac(secret, body)}`
}
export async function verify<T = Record<string, unknown>>(secret: string, token: string | undefined): Promise<T | null> {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  if ((await hmac(secret, body)) !== sig) return null
  try { const p = JSON.parse(unb64url(body)) as T & { exp?: number }; if (p.exp && p.exp < now()) return null; return p } catch { return null }
}

export function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (req.headers.get('cookie') ?? '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim() }
  return out
}
export function setCookie(name: string, value: string, maxAgeSec: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`
}
export const clearCookie = (name: string) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`

export const normalizeCode = (s: string) => s.replace(/[\s\-–—_]/g, '').toUpperCase()

/** Image storage: R2 when bound, else KV. Reads try both so a later R2 switch keeps old images. */
export async function putImage(env: Env, key: string, bytes: ArrayBuffer, type: string) {
  if (env.IMAGES) { await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } }); return 'r2' }
  if (env.IMAGES_KV) { await env.IMAGES_KV.put(key, bytes, { metadata: { type } }); return 'kv' }
  throw new Error('no image storage bound')
}
export async function getImage(env: Env, key: string): Promise<{ body: ArrayBuffer | ReadableStream; type: string } | null> {
  if (env.IMAGES) { const o = await env.IMAGES.get(key); if (o) return { body: o.body, type: o.httpMetadata?.contentType ?? 'image/webp' } }
  if (env.IMAGES_KV) { const r = await env.IMAGES_KV.getWithMetadata<{ type?: string }>(key, 'arrayBuffer'); if (r.value) return { body: r.value, type: r.metadata?.type ?? 'image/webp' } }
  return null
}
export async function deleteImage(env: Env, key: string) {
  await Promise.all([env.IMAGES?.delete(key), env.IMAGES_KV?.delete(key)])
}

/** simple per-key rate limit in D1: n hits per minute */
export async function rateLimit(env: Env, key: string, limit: number) {
  const minute = Math.floor(now() / 60000)
  const row = await env.DB.prepare('SELECT n, minute FROM attempts WHERE key = ?').bind(key).first<{ n: number; minute: number }>()
  const n = row && row.minute === minute ? row.n + 1 : 1
  await env.DB.prepare('INSERT INTO attempts (key, n, minute) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET n = ?, minute = ?').bind(key, n, minute, n, minute).run()
  return n <= limit
}

/** Collections a viewer may see. null = everything (admin or scope 'all'). */
export async function viewerScope(env: Env, viewer: Viewer | undefined, admin: boolean): Promise<string[] | null> {
  if (admin || !viewer) return null
  const inv = await env.DB.prepare('SELECT scope FROM invites WHERE id = ?').bind(viewer.inv).first<{ scope: string }>()
  if (!inv || inv.scope !== 'some') return null
  const rows = (await env.DB.prepare('SELECT collection_id FROM invite_collections WHERE invite_id = ?').bind(viewer.inv).all<{ collection_id: string }>()).results
  return rows.map((r) => r.collection_id)
}

/** D1 caps a statement at 100 bound parameters: run id lists in chunks. */
export const chunks = <T,>(a: T[], n = 80): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }

/** Hard-delete prompts with their tags / P / image rows and the stored image objects. */
export async function deletePrompts(env: Env, ids: string[]) {
  for (const part of chunks(ids)) {
    const ph = part.map(() => '?').join(',')
    const imgs = (await env.DB.prepare(`SELECT r2_key FROM images WHERE prompt_id IN (${ph})`).bind(...part).all<{ r2_key: string }>()).results
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM images WHERE prompt_id IN (${ph})`).bind(...part),
      env.DB.prepare(`DELETE FROM tags WHERE prompt_id IN (${ph})`).bind(...part),
      env.DB.prepare(`DELETE FROM prompt_p WHERE prompt_id IN (${ph})`).bind(...part),
      env.DB.prepare(`DELETE FROM prompts WHERE id IN (${ph})`).bind(...part),
    ])
    await Promise.all(imgs.map((i) => deleteImage(env, i.r2_key)))
  }
}
