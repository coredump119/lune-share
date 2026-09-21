import { type Env, type Viewer, json, bad, viewerScope } from '../_lib'
import { loadPrompts } from '../_prompts'
export const onRequestGet: PagesFunction<Env> = async ({ env, data, params }) => {
  const d = data as { admin?: boolean; viewer?: Viewer }
  const [p] = await loadPrompts(env, { admin: !!d.admin, id: String(params.id), scope: await viewerScope(env, d.viewer, !!d.admin) })
  return p ? json({ prompt: p }) : bad('not found', 404)
}
