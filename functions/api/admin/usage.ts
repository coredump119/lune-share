import { type Env, json } from '../_lib'
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const [p, i, inv, s] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM prompts').first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM images').first<{ n: number; bytes: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active FROM invites').first<{ n: number; active: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE last_seen_at > ?').bind(Date.now() - 7 * 86400000).first<{ n: number }>(),
  ])
  return json({ prompts: p?.n ?? 0, images: i?.n ?? 0, imageBytes: i?.bytes ?? 0, invites: inv?.n ?? 0, activeInvites: inv?.active ?? 0, activeSessions7d: s?.n ?? 0, storage: env.IMAGES ? 'r2' : 'kv', kvLimitBytes: env.IMAGES ? null : 1024 ** 3 })
}
