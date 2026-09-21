import { type Env, json, bad, uid, now, putImage } from '../_lib'
/** Body = raw image bytes (already re-encoded in the browser). Headers: x-width, x-height, content-type. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const type = request.headers.get('content-type') ?? 'image/webp'
  if (!type.startsWith('image/')) return bad('not an image')
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength > 6 * 1024 * 1024) return bad('图片超过 6 MB，请先压缩', 413)
  const w = Number(request.headers.get('x-width') ?? 0), h = Number(request.headers.get('x-height') ?? 0)
  const key = uid()
  await putImage(env, key, bytes, type)
  await env.DB.prepare('INSERT INTO images (id, prompt_id, r2_key, width, height, size, sort, created_at) VALUES (?, NULL, ?, ?, ?, ?, 0, ?)').bind(key, key, w, h, bytes.byteLength, now()).run()
  return json({ id: key, url: `/api/img/${key}`, width: w, height: h, size: bytes.byteLength })
}
