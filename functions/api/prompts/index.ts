import { type Env, type Viewer, json, viewerScope } from '../_lib'
import { loadPrompts } from '../_prompts'
export const onRequestGet: PagesFunction<Env> = async ({ env, data, request }) => {
  const url = new URL(request.url)
  const d = data as { admin?: boolean; viewer?: Viewer }
  const scope = await viewerScope(env, d.viewer, !!d.admin)
  const prompts = await loadPrompts(env, { admin: !!d.admin, collection: url.searchParams.get('collection') ?? undefined, scope })
  let collections = (await env.DB.prepare('SELECT id, name, sort FROM collections ORDER BY sort ASC, name ASC').all<{ id: string; name: string; sort: number }>()).results
  if (scope) collections = collections.filter((c) => scope.includes(c.id))
  return json({ prompts, collections })
}
