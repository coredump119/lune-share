#!/usr/bin/env node
/**
 * One-command setup: creates everything on YOUR Cloudflare account and deploys.
 *   npm run setup            interactive
 *   npm run setup -- --dry-run   show what would run, change nothing
 * Nothing here talks to anyone's account but the one you log into with `wrangler login`.
 */
import { spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'

const DRY = process.argv.includes('--dry-run')
const rl = createInterface({ input: process.stdin, output: process.stdout })
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m` }
const step = (n, t) => console.log(`\n${c.b(`[${n}/8]`)} ${t}`)
// own line queue instead of rl.question: answers that arrive early (piped input, fast typing) are not lost
const lines = []; const waiters = []; let closed = false
rl.on('line', (l) => { const w = waiters.shift(); if (w) w(l); else lines.push(l) })
rl.on('close', () => { closed = true; for (const w of waiters.splice(0)) w('') })
const ask = async (q, def) => {
  process.stdout.write(`${q}${def ? c.dim(` (${def})`) : ''}: `)
  const a = lines.length ? lines.shift() : closed ? '' : await new Promise((res) => waiters.push(res))
  if (!process.stdin.isTTY) process.stdout.write(a + '\n')
  return a.trim() || def || ''
}

/** run wrangler; returns { ok, out }. `input` is piped to stdin (used for secrets so they never show up in argv). */
function wr(args, { input, show = false } = {}) {
  console.log(c.dim(`  $ npx wrangler ${args.join(' ')}`))
  if (DRY) return { ok: true, out: '' }
  const r = spawnSync('npx', ['--yes', 'wrangler', ...args], { encoding: 'utf8', input, shell: process.platform === 'win32', stdio: show ? ['inherit', 'inherit', 'inherit'] : ['pipe', 'pipe', 'pipe'] })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}\n${r.stderr ?? ''}` }
}
export const parseId = (out) => out.match(/"?(?:database_id|id)"?\s*[=:]\s*"([0-9a-f-]{32,36})"/i)?.[1] ?? null
export const parseUrl = (out) => out.match(/https:\/\/[a-z0-9-]+\.pages\.dev/i)?.[0] ?? null
const secret = (n) => randomBytes(n).toString('base64url')
const die = (msg) => { console.error('\n' + c.r('✘ ' + msg)); process.exit(1) }

if (process.argv.includes('--selftest')) {
  const ok = parseId('database_id = "11111111-2222-3333-4444-555555555555"') === '11111111-2222-3333-4444-555555555555'
    && parseId('{ "binding": "IMAGES_KV", "id": "0123456789abcdef0123456789abcdef" }') === '0123456789abcdef0123456789abcdef'
    && parseId('id = "0123456789abcdef0123456789abcdef"') === '0123456789abcdef0123456789abcdef'
    && parseUrl("It will be available at https://my-prompts-9x2.pages.dev/ once") === 'https://my-prompts-9x2.pages.dev'
    && parseId('nothing here') === null
  console.log(ok ? 'selftest ok' : 'selftest FAILED'); process.exit(ok ? 0 : 1)
}

console.log(c.b('\nLUNE Share · setup') + (DRY ? c.y('  (dry run: nothing will be created)') : ''))
console.log(c.dim('Creates a D1 database, image storage, secrets and a Pages site on your own Cloudflare account.\n'))
if (Number(process.versions.node.split('.')[0]) < 18) die('Node 18 or newer is required.')
if (existsSync('wrangler.toml') && !DRY) {
  const a = await ask('wrangler.toml already exists, so this project looks set up. Run setup again and overwrite it? y/N', 'N')
  if (!/^y/i.test(a)) { console.log('Nothing changed. To publish code changes use: npm run deploy'); process.exit(0) }
}

step(1, 'Cloudflare login')
if (!DRY && !/You are logged in|associated with the email|Account Name/i.test(wr(['whoami']).out)) {
  console.log('  A browser window will open. Log in (or sign up, it is free) and click Allow.')
  for (let attempt = 1; ; attempt++) {
    // from the second try on, don't reopen the default browser: just print the link so it can go into a private window
    const r = spawnSync('npx', ['--yes', 'wrangler', 'login', ...(attempt > 1 ? ['--browser=false'] : [])], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['inherit', 'pipe', 'pipe'] })
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    process.stdout.write(out.split('\n').filter((l) => !/CSRF|request_forbidden|Logs were written/.test(l)).join('\n'))
    if (r.status === 0 && /Successfully logged in/i.test(out)) break
    const csrf = /CSRF|request_forbidden/i.test(out)
    console.log('\n' + c.y(csrf ? '  登录页面没能记住它自己的 cookie，浏览器把它拦下了。这不是你的问题，也没坏任何东西。' : '  登录没有完成。'))
    console.log(`  请这样做，然后回到这里按回车重试：
    1. 关掉刚才弹出来的那个浏览器标签页。
    2. 开一个${c.b('无痕 / 隐私窗口')}：Safari 按 ⌘⇧N。如果 Safari 无痕也不行，就换 Edge（微软官网国内能直接下载）或 Chrome 的无痕窗口。
    3. 按回车后命令行会再打印一个以 https://dash.cloudflare.com/oauth2 开头的网址，${c.b('把它整行复制到无痕窗口里打开')}，登录并点 Allow。
    还不行的话：在浏览器里打开 dash.cloudflare.com，右上角退出登录，再回来重试。`)
    if (attempt >= 4) die('Login still failing. Run `npx wrangler login --browser=false` yourself, open the printed link in a private window, then run setup again.')
    const a = await ask('  准备好了按回车重试，输入 q 退出', '')
    if (/^q/i.test(a)) process.exit(1)
  }
}
console.log(c.g('  ✓ logged in'))

step(2, 'A few questions')
let slug = ''
while (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) slug = (await ask('  Project id, becomes <id>.pages.dev. Lowercase letters, digits, dashes', 'my-prompts')).toLowerCase()
const siteName = await ask('  Site name shown to visitors', 'Prompt Share')
const tagline = await ask('  Small line above the name (can be empty)', 'invite only')
console.log('  Where should images live?\n    1) KV  — free, no credit card, 1 GB total (about 3000 images)\n    2) R2  — free up to 10 GB, but Cloudflare asks for a card to enable it')
let storage = (await ask('  Choose 1 or 2', '1')) === '2' ? 'r2' : 'kv'

step(3, 'Database (D1)')
let d1 = wr(['d1', 'create', slug]); let dbId = parseId(d1.out)
if (!dbId && !DRY) { const list = wr(['d1', 'list', '--json']).out; try { dbId = JSON.parse(list.slice(list.indexOf('['))).find((d) => d.name === slug)?.uuid ?? null } catch { /* fall through */ } }
if (!dbId && !DRY) die('Could not create or find the D1 database. Cloudflare said:\n' + d1.out)
console.log(c.g(`  ✓ ${slug} ${dbId ?? '(dry run)'}`))

step(4, `Image storage (${storage.toUpperCase()})`)
let kvId = null
if (storage === 'r2') {
  const r = wr(['r2', 'bucket', 'create', `${slug}-images`])
  if (!r.ok && !/already exists|already own/i.test(r.out)) { console.log(c.y('  R2 is not enabled on this account (it needs a card once). Falling back to KV.')); storage = 'kv' }
}
if (storage === 'kv') {
  const r = wr(['kv', 'namespace', 'create', `${slug}-images`]); kvId = parseId(r.out)
  if (!kvId && !DRY) { const list = wr(['kv', 'namespace', 'list']).out; try { kvId = JSON.parse(list.slice(list.indexOf('['))).find((n) => n.title.includes(`${slug}-images`))?.id ?? null } catch { /* fall through */ } }
  if (!kvId && !DRY) die('Could not create the KV namespace.\n' + r.out)
}
console.log(c.g(`  ✓ ${storage === 'r2' ? `bucket ${slug}-images` : `namespace ${kvId ?? '(dry run)'}`}`))

step(5, 'Write wrangler.toml')
const q = (s) => JSON.stringify(s)
const toml = `# generated by scripts/setup.mjs for YOUR Cloudflare account. Safe to edit; the ids are not secrets.
name = ${q(slug)}
compatibility_date = "2025-09-01"
pages_build_output_dir = "dist"

[vars]
SITE_NAME = ${q(siteName)}
SITE_TAGLINE = ${q(tagline)}
SESSION_DAYS = "30"
# "all": every invited viewer can bulk-export what they see. "admin": only you.
EXPORT_FOR = "all"

[[d1_databases]]
binding = "DB"
database_name = ${q(slug)}
database_id = ${q(dbId ?? 'DRY-RUN')}
${storage === 'r2' ? `\n[[r2_buckets]]\nbinding = "IMAGES"\nbucket_name = ${q(slug + '-images')}\n` : `\n[[kv_namespaces]]\nbinding = "IMAGES_KV"\nid = ${q(kvId ?? 'DRY-RUN')}\n`}`
if (DRY) console.log(c.dim(toml.split('\n').map((l) => '  | ' + l).join('\n'))); else writeFileSync('wrangler.toml', toml)
console.log(c.g('  ✓ wrangler.toml'))

step(6, 'Create tables')
if (!DRY && spawnSync('node', ['scripts/migrate.mjs'], { stdio: 'inherit', shell: process.platform === 'win32' }).status !== 0) die('Creating tables failed. Run it again with: npm run db:apply')
console.log(c.g('  ✓ schema applied'))

step(7, 'Pages project and secrets')
// transient network errors (common on slow links) get a few retries; a real error is shown in full
const retry = (label, args, opts) => { let r; for (let i = 1; i <= 3; i++) { r = wr(args, opts); if (r.ok) return r; if (i < 3) console.log(c.y(`  … ${label} failed, retrying (${i}/3)`)) } return r }
const created = wr(['pages', 'project', 'create', slug, '--production-branch', 'main'])
let url = parseUrl(created.out)
if (!DRY && !created.ok && !/already exists|already taken|8000007/i.test(created.out)) die(`Could not create the Pages project "${slug}".\n${created.out}`)
if (!DRY) {
  // make sure the project really exists before storing secrets into it (a taken name fails silently otherwise)
  const list = wr(['pages', 'project', 'list']).out
  if (!list.includes(slug)) die(`The name "${slug}" could not be used (someone else on Cloudflare already has it). Run setup again with a different Project id.\n${created.out}`)
}
const adminSecret = secret(18), sessionSecret = secret(36)
for (const [k, v] of [['ADMIN_SECRET', adminSecret], ['SESSION_SECRET', sessionSecret]]) {
  const r = retry(k, ['pages', 'secret', 'put', k, '--project-name', slug], { input: v + '\n' })
  if (!r.ok) die(`Could not store ${k}. Cloudflare said:\n${r.out.trim()}\n\nUsually the network dropped for a moment. Run \`npm run setup\` again (answer y to overwrite); everything already created is reused.`)
}
if (!DRY) writeFileSync('.dev.vars', `# local only, never committed. ADMIN_SECRET is your admin password.\nADMIN_SECRET=${adminSecret}\nSESSION_SECRET=${sessionSecret}\n`)
console.log(c.g('  ✓ secrets stored on Cloudflare and in .dev.vars'))

step(8, 'Build and deploy')
if (!DRY) { const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' }); if (b.status !== 0) die('Build failed.') }
// twice on purpose: bindings and secrets added to a brand-new project only take effect from the next deployment
for (let i = 0; i < 2; i++) { const d = retry('deploy', ['pages', 'deploy', 'dist', '--project-name', slug, '--commit-dirty=true']); if (!d.ok) die('Deploy failed. Cloudflare said:\n' + d.out) }
console.log(c.g('  ✓ deployed'))
if (!DRY) { const list = wr(['pages', 'project', 'list']).out; const line = list.split('\n').find((l) => l.includes(` ${slug} `) || l.includes(`│ ${slug}`)); url = (line && line.match(/[a-z0-9-]+\.pages\.dev/i)?.[0] ? 'https://' + line.match(/[a-z0-9-]+\.pages\.dev/i)[0] : url) ?? `https://${slug}.pages.dev` }

console.log(`\n${c.g(c.b('Done.'))}
  Site        ${c.b(url ?? `https://${slug}.pages.dev`)}
  Admin       ${url ?? `https://${slug}.pages.dev`}/#/admin
  Admin key   ${c.b(DRY ? '(dry run)' : adminSecret)}   ${c.dim('← also saved in .dev.vars. Keep it private.')}

Next: open the admin page, paste the admin key, create your first invite code under 邀请码.
After changing code or wrangler.toml: ${c.b('npm run deploy')}`)
rl.close()
