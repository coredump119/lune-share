import { type Env, json, bad, sha256, rateLimit, sign, setCookie, now } from '../_lib'
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'x'
  if (!(await rateLimit(env, 'admin:' + (await sha256(ip)).slice(0, 16), 5))) return bad('尝试太频繁', 429)
  const { secret } = (await request.json().catch(() => ({}))) as { secret?: string }
  if (!secret || secret !== env.ADMIN_SECRET) return bad('密钥不对', 403)
  const token = await sign(env.SESSION_SECRET, { role: 'admin', exp: now() + 7 * 86400000 })
  return json({ ok: true }, 200, { 'set-cookie': setCookie('ls_admin', token, 7 * 86400) })
}
