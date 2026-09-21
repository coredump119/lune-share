import { type Env, json, clearCookie } from '../_lib'
export const onRequestPost: PagesFunction<Env> = async () => {
  const h = new Headers({ 'content-type': 'application/json' })
  h.append('set-cookie', clearCookie('ls_session')); h.append('set-cookie', clearCookie('ls_admin'))
  return new Response(JSON.stringify({ ok: true }), { headers: h })
}
