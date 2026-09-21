export interface PImage { id: string; url: string; width: number; height: number }
export interface Prompt { id: string; title: string | null; text: string; params: string | null; note: string | null; collectionId: string | null; showP: boolean; published: boolean; sort: number; createdAt: number; updatedAt: number; images: PImage[]; tags: string[]; p: { name: string; code: string }[]; author: string | null; authorInvite: string | null }
export interface Collection { id: string; name: string; sort: number }
export interface Invite { id: string; label: string; created_at: number; expires_at: number | null; revoked_at: number | null; max_devices: number; can_post: number; note: string | null; devices: number; last_seen: number | null; scope: 'all' | 'some'; collections: string[] }

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, ...init })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
  return j
}
export const api = {
  me: () => req<{ site: { name: string; tagline: string }; viewer: boolean; admin: boolean; label: string | null; canPost: boolean; canExport: boolean }>('/api/auth/me'),
  enter: (code: string) => req<{ ok: true; label: string }>('/api/auth/enter', { method: 'POST', body: JSON.stringify({ code }) }),
  adminLogin: (secret: string) => req<{ ok: true }>('/api/auth/admin', { method: 'POST', body: JSON.stringify({ secret }) }),
  logout: () => req<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  prompts: () => req<{ prompts: Prompt[]; collections: Collection[] }>('/api/prompts'),
  prompt: (id: string) => req<{ prompt: Prompt }>(`/api/prompts/${id}`),
  createPrompt: (b: object) => req<{ prompt: Prompt }>('/api/admin/prompts', { method: 'POST', body: JSON.stringify(b) }),
  updatePrompt: (id: string, b: object) => req<{ prompt: Prompt }>(`/api/admin/prompts/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deletePrompt: (id: string) => req<{ ok: true }>(`/api/admin/prompts/${id}`, { method: 'DELETE' }),
  promptAction: (id: string, action: 'pin' | 'unpin' | 'approve' | 'unpublish') => req<{ prompt: Prompt }>(`/api/admin/prompts/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) }),
  batch: (ids: string[], action: 'approve' | 'unpublish' | 'delete' | 'pin' | 'unpin') => req<{ ok: true; n: number }>('/api/admin/prompts/batch', { method: 'POST', body: JSON.stringify({ ids, action }) }),
  contribPrompt: (b: object) => req<{ ok: true; id: string }>('/api/contrib/prompts', { method: 'POST', body: JSON.stringify(b) }),
  collection: (b: object) => req<{ id?: string; ok?: true; deleted?: number }>('/api/admin/collections', { method: 'POST', body: JSON.stringify(b) }),
  invites: () => req<{ invites: Invite[] }>('/api/admin/invites'),
  createInvite: (b: object) => req<{ id: string; code: string; label: string }>('/api/admin/invites', { method: 'POST', body: JSON.stringify(b) }),
  patchInvite: (id: string, b: object) => req<{ ok: true }>(`/api/admin/invites/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),
  deleteInvite: (id: string) => req<{ ok: true }>(`/api/admin/invites/${id}`, { method: 'DELETE' }),
  inviteDetail: (id: string) => req<{ sessions: { device_id: string; created_at: number; last_seen_at: number; ua: string }[]; log: { at: number; action: string }[] }>(`/api/admin/invites/${id}`),
  usage: () => req<{ prompts: number; images: number; imageBytes: number; invites: number; activeInvites: number; activeSessions7d: number; storage: string; kvLimitBytes: number | null }>('/api/admin/usage'),
  async uploadImage(blob: Blob, w: number, h: number, contrib = false) {
    const r = await fetch(contrib ? '/api/contrib/images' : '/api/admin/images', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type || 'image/webp', 'x-width': String(w), 'x-height': String(h) }, body: blob })
    const j = (await r.json()) as PImage & { size: number; error?: string }
    if (!r.ok) throw new Error(j.error || 'upload failed')
    return j
  },
}
