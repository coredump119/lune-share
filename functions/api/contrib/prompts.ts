import { type Env, type Viewer, json, bad, uid, now, viewerScope } from '../_lib'
import { writePrompt, type PromptInput } from '../admin/prompts/index'
/** Contributor submission: always unpublished, P never public, author recorded; admin approves in 内容. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const v = (data as { viewer?: Viewer }).viewer
  const b = (await request.json().catch(() => null)) as PromptInput | null
  if (!b?.text?.trim()) return bad('prompt 不能为空')
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM prompts WHERE author_invite = ? AND created_at > ?').bind(v?.inv ?? '', now() - 86400000).first<{ n: number }>()
  if ((recent?.n ?? 0) >= 30) return bad('今天投稿太多了，明天再来', 429)
  const scope = await viewerScope(env, v, false)
  if (scope && (!b.collectionId || !scope.includes(b.collectionId))) return bad('请选择一个你有权限的集合')
  const id = uid()
  await writePrompt(env, id, { ...b, createdAt: undefined, published: false, showP: false }, true, v?.inv ?? null)
  await env.DB.prepare('INSERT INTO access_log (invite_id, at, action, ua) VALUES (?, ?, ?, ?)').bind(v?.inv ?? null, now(), 'contrib', (request.headers.get('user-agent') ?? '').slice(0, 160)).run()
  return json({ ok: true, id })
}
