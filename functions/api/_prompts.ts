import type { Env } from './_lib'
export interface PromptRow { id: string; title: string | null; text: string; params: string | null; note: string | null; collection_id: string | null; show_p: number; published: number; sort: number; created_at: number; updated_at: number; author_invite: string | null; author_label?: string | null }
export interface ImageRow { id: string; prompt_id: string; r2_key: string; width: number; height: number; size: number; sort: number }

/** Load prompts with images / tags / P (P only when show_p or admin). */
export async function loadPrompts(env: Env, opts: { admin: boolean; id?: string; collection?: string; scope?: string[] | null }) {
  const where: string[] = []; const vals: unknown[] = []
  if (!opts.admin) where.push('published = 1')
  if (opts.scope) { if (!opts.scope.length) return []; where.push(`collection_id IN (${opts.scope.map(() => '?').join(',')})`); vals.push(...opts.scope) }
  if (opts.id) { where.push('id = ?'); vals.push(opts.id) }
  if (opts.collection) { where.push('collection_id = ?'); vals.push(opts.collection) }
  const rows = (await env.DB.prepare(`SELECT p.*, i.label AS author_label FROM prompts p LEFT JOIN invites i ON i.id = p.author_invite ${where.length ? 'WHERE ' + where.map((w) => 'p.' + w).join(' AND ') : ''} ORDER BY p.sort DESC, p.created_at DESC`).bind(...vals).all<PromptRow>()).results
  if (!rows.length) return []
  // children are fetched with the same filter as a subquery: D1 caps a statement at 100 bound parameters,
  // so `IN (?, ?, …)` over every prompt id would start failing past 100 prompts
  const sub = `SELECT p.id FROM prompts p ${where.length ? 'WHERE ' + where.map((w) => 'p.' + w).join(' AND ') : ''}`
  const [imgs, tags, ps] = await Promise.all([
    env.DB.prepare(`SELECT * FROM images WHERE prompt_id IN (${sub}) ORDER BY sort ASC, created_at ASC`).bind(...vals).all<ImageRow>(),
    env.DB.prepare(`SELECT prompt_id, tag FROM tags WHERE prompt_id IN (${sub})`).bind(...vals).all<{ prompt_id: string; tag: string }>(),
    env.DB.prepare(`SELECT prompt_id, p_name, p_code FROM prompt_p WHERE prompt_id IN (${sub})`).bind(...vals).all<{ prompt_id: string; p_name: string; p_code: string }>(),
  ])
  return rows.map((r) => ({
    id: r.id, title: r.title, text: r.text, params: r.params, note: r.note, collectionId: r.collection_id,
    showP: !!r.show_p, published: !!r.published, sort: r.sort, createdAt: r.created_at, updatedAt: r.updated_at, author: r.author_label ?? null, authorInvite: opts.admin ? r.author_invite : null,
    images: imgs.results.filter((i) => i.prompt_id === r.id).map((i) => ({ id: i.id, url: `/api/img/${i.r2_key}`, width: i.width, height: i.height })),
    tags: tags.results.filter((t) => t.prompt_id === r.id).map((t) => t.tag),
    p: (opts.admin || r.show_p) ? ps.results.filter((p) => p.prompt_id === r.id).map((p) => ({ name: p.p_name, code: p.p_code })) : [],
  }))
}
