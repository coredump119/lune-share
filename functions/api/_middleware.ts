import { type Env, type Viewer, cookies, verify, json, now } from './_lib'

/** Attach viewer / admin to context. Viewer sessions are re-checked against the invite on every request (revocation is instant). */
export const onRequest: PagesFunction<Env>[] = [
  async (ctx) => {
    const c = cookies(ctx.request)
    const admin = await verify<{ role: string }>(ctx.env.SESSION_SECRET, c.ls_admin)
    if (admin?.role === 'admin') ctx.data.admin = true
    const v = await verify<Viewer>(ctx.env.SESSION_SECRET, c.ls_session)
    if (v?.sid) {
      const row = await ctx.env.DB.prepare(
        'SELECT s.id, i.revoked_at, i.expires_at FROM sessions s JOIN invites i ON i.id = s.invite_id WHERE s.id = ? AND s.invite_id = ?',
      ).bind(v.sid, v.inv).first<{ id: string; revoked_at: number | null; expires_at: number | null }>()
      if (row && !row.revoked_at && (!row.expires_at || row.expires_at > now())) {
        ctx.data.viewer = v
        ctx.waitUntil(ctx.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now(), v.sid).run())
      }
    }
    const url = new URL(ctx.request.url)
    const isPublic = url.pathname.startsWith('/api/auth/')
    if (!isPublic && !ctx.data.viewer && !ctx.data.admin) return json({ error: 'unauthorized' }, 401)
    if (url.pathname.startsWith('/api/admin/') && !ctx.data.admin) return json({ error: 'forbidden' }, 403)
    if (url.pathname.startsWith('/api/contrib/') && !ctx.data.admin) {
      const v = ctx.data.viewer as Viewer | undefined
      const inv = v ? await ctx.env.DB.prepare('SELECT can_post FROM invites WHERE id = ?').bind(v.inv).first<{ can_post: number }>() : null
      if (!inv?.can_post) return json({ error: '这个邀请码没有投稿权限' }, 403)
    }
    return ctx.next()
  },
]
