import { type Env, json, bad, uid, now } from '../../_lib'
import { loadPrompts } from '../../_prompts'
export interface PromptInput { title?: string; text: string; params?: string; note?: string; collectionId?: string | null; showP?: boolean; published?: boolean; tags?: string[]; p?: { name: string; code: string }[]; imageIds?: string[]; createdAt?: number }
export async function writePrompt(env: Env, id: string, b: PromptInput, create: boolean, author: string | null = null) {
  const t = now()
  // admin may backdate a prompt (LUNE import keeps the original creation time); clamp to a sane range
  const ct = create && typeof b.createdAt === 'number' && b.createdAt > 1.4e12 && b.createdAt <= t + 86400000 ? Math.floor(b.createdAt) : t
  const stmts: D1PreparedStatement[] = []
  if (create) stmts.push(env.DB.prepare('INSERT INTO prompts (id, title, text, params, note, collection_id, show_p, published, sort, created_at, updated_at, author_invite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, b.title?.trim() || null, b.text.trim(), b.params?.trim() || null, b.note?.trim() || null, b.collectionId || null, b.showP ? 1 : 0, b.published === false ? 0 : 1, ct, ct, t, author))
  else stmts.push(env.DB.prepare('UPDATE prompts SET title = ?, text = ?, params = ?, note = ?, collection_id = ?, show_p = ?, published = ?, updated_at = ? WHERE id = ?')
    .bind(b.title?.trim() || null, b.text.trim(), b.params?.trim() || null, b.note?.trim() || null, b.collectionId || null, b.showP ? 1 : 0, b.published === false ? 0 : 1, t, id))
  stmts.push(env.DB.prepare('DELETE FROM tags WHERE prompt_id = ?').bind(id), env.DB.prepare('DELETE FROM prompt_p WHERE prompt_id = ?').bind(id))
  for (const tag of [...new Set((b.tags ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))]) stmts.push(env.DB.prepare('INSERT INTO tags (prompt_id, tag) VALUES (?, ?)').bind(id, tag))
  for (const p of b.p ?? []) if (p.code?.trim()) stmts.push(env.DB.prepare('INSERT INTO prompt_p (prompt_id, p_name, p_code) VALUES (?, ?, ?)').bind(id, (p.name || p.code).trim(), p.code.trim()))
  if (b.imageIds) {
    stmts.push(env.DB.prepare('UPDATE images SET prompt_id = NULL WHERE prompt_id = ?').bind(id))
    b.imageIds.forEach((imgId, i) => stmts.push(env.DB.prepare('UPDATE images SET prompt_id = ?, sort = ? WHERE id = ?').bind(id, i, imgId)))
  }
  await env.DB.batch(stmts)
}
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const b = (await request.json().catch(() => null)) as PromptInput | null
  if (!b?.text?.trim()) return bad('prompt 不能为空')
  const id = uid()
  await writePrompt(env, id, b, true)
  const [p] = await loadPrompts(env, { admin: true, id })
  return json({ prompt: p })
}
