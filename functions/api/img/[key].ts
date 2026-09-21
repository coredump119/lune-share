import { type Env, type Viewer, getImage, viewerScope } from '../_lib'
export const onRequestGet: PagesFunction<Env> = async ({ env, params, data }) => {
  const key = String(params.key)
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(key)) return new Response('bad key', { status: 400 })
  const d = data as { admin?: boolean; viewer?: Viewer }
  const scope = await viewerScope(env, d.viewer, !!d.admin)
  if (scope) {
    const own = await env.DB.prepare('SELECT p.collection_id, p.published FROM images i LEFT JOIN prompts p ON p.id = i.prompt_id WHERE i.r2_key = ?').bind(key).first<{ collection_id: string | null; published: number }>()
    if (!own || !own.published || !own.collection_id || !scope.includes(own.collection_id)) return new Response('forbidden', { status: 403 })
  }
  const img = await getImage(env, key)
  if (!img) return new Response('not found', { status: 404 })
  return new Response(img.body, { headers: { 'content-type': img.type, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' } })
}
