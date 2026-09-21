import { type Env, json, bad, deleteImage } from '../../_lib'
import { loadPrompts } from '../../_prompts'
import { writePrompt, type PromptInput } from './index'
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id)
  const cur = await env.DB.prepare('SELECT id FROM prompts WHERE id = ?').bind(id).first()
  if (!cur) return bad('not found', 404)
  const raw = (await request.json().catch(() => null)) as (PromptInput & { action?: 'pin' | 'unpin' | 'approve' | 'unpublish' }) | null
  if (raw?.action) {
    const t = Date.now()
    if (raw.action === 'pin') await env.DB.prepare('UPDATE prompts SET sort = ?, updated_at = ? WHERE id = ?').bind(t, t, id).run()
    if (raw.action === 'unpin') await env.DB.prepare('UPDATE prompts SET sort = created_at, updated_at = ? WHERE id = ?').bind(t, id).run()
    if (raw.action === 'approve') await env.DB.prepare('UPDATE prompts SET published = 1, updated_at = ? WHERE id = ?').bind(t, id).run()
    if (raw.action === 'unpublish') await env.DB.prepare('UPDATE prompts SET published = 0, updated_at = ? WHERE id = ?').bind(t, id).run()
    const [p] = await loadPrompts(env, { admin: true, id })
    return json({ prompt: p })
  }
  const b = raw as PromptInput | null
  if (!b?.text?.trim()) return bad('prompt 不能为空')
  await writePrompt(env, id, b, false)
  const [p] = await loadPrompts(env, { admin: true, id })
  return json({ prompt: p })
}
export const onRequestDelete: PagesFunction<Env> = async ({ env, params }) => {
  const id = String(params.id)
  const imgs = (await env.DB.prepare('SELECT r2_key FROM images WHERE prompt_id = ?').bind(id).all<{ r2_key: string }>()).results
  await env.DB.batch([
    env.DB.prepare('DELETE FROM images WHERE prompt_id = ?').bind(id),
    env.DB.prepare('DELETE FROM tags WHERE prompt_id = ?').bind(id),
    env.DB.prepare('DELETE FROM prompt_p WHERE prompt_id = ?').bind(id),
    env.DB.prepare('DELETE FROM prompts WHERE id = ?').bind(id),
  ])
  await Promise.all(imgs.map((i) => deleteImage(env, i.r2_key)))
  return json({ ok: true })
}
