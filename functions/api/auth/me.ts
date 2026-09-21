import { type Env, json } from '../_lib'
export const onRequestGet: PagesFunction<Env> = async ({ data, env }) => {
  const d = data as { viewer?: { inv: string }; admin?: boolean }
  let label: string | null = null, canPost = false
  if (d.viewer) { const r = await env.DB.prepare('SELECT label, can_post FROM invites WHERE id = ?').bind(d.viewer.inv).first<{ label: string; can_post: number }>(); label = r?.label ?? null; canPost = !!r?.can_post }
  return json({ site: { name: env.SITE_NAME || 'Prompt Share', tagline: env.SITE_TAGLINE ?? 'invite only' }, viewer: !!d.viewer, admin: !!d.admin, label, canPost, canExport: !!d.admin || env.EXPORT_FOR !== 'admin' })
}
