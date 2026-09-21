import { type Env, json, bad, uid, now, putImage } from '../_lib'
/** Contributor upload: same as admin images, but rate-limited and capped at 3 MB. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const type = request.headers.get('content-type') ?? 'image/webp'
  if (!type.startsWith('image/')) return bad('not an image')
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > 3 * 1024 * 1024) return bad('图片超过 3 MB', 413)
  const key = uid()
  await putImage(env, key, bytes, type)
  await env.DB.prepare('INSERT INTO images (id, prompt_id, r2_key, width, height, size, sort, created_at) VALUES (?, NULL, ?, ?, ?, ?, 0, ?)').bind(key, key, Number(request.headers.get('x-width') ?? 0), Number(request.headers.get('x-height') ?? 0), bytes.byteLength, now()).run()
  return json({ id: key, url: `/api/img/${key}`, width: Number(request.headers.get('x-width') ?? 0), height: Number(request.headers.get('x-height') ?? 0), size: bytes.byteLength })
}
