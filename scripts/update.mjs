#!/usr/bin/env node
/**
 * Update this site to the latest template version, keeping your configuration:
 *   npm run update
 * Downloads the current code from GitHub, copies it over this folder (except the files listed in KEEP),
 * installs dependencies, applies new database migrations, deploys. Your data lives on Cloudflare and is untouched.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, cpSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REPO = 'coredump119/lune-share'
// files that older versions had and the template no longer ships
const REMOVE = ['schema.sql']
const KEEP = ['wrangler.toml', '.dev.vars', 'node_modules', 'dist', '.git', '.wrangler', 'public/day.jpg', 'public/night.jpg']
const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` }
const die = (m) => { console.error('\n' + c.r('✘ ' + m)); process.exit(1) }
const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' }).status === 0

if (!existsSync('wrangler.toml')) die('No wrangler.toml here. Run this inside your site folder, and run `npm run setup` first if you never did.')
const mine = JSON.parse(readFileSync('package.json', 'utf8')).version
console.log(c.b(`\nLUNE Share · update`) + c.d(`  (you have ${mine})`))

console.log('\n[1/5] Downloading the latest code')
const latestPkg = await fetch(`https://raw.githubusercontent.com/${REPO}/main/package.json`).then((r) => r.ok ? r.json() : null).catch(() => null)
if (!latestPkg) die('Could not reach GitHub. Check your connection and try again.')
if (latestPkg.version === mine && !process.argv.includes('--force')) { console.log(c.g(`  ✓ already on the latest version (${mine}). Nothing to do.`)); process.exit(0) }
console.log(`  ${mine} → ${c.b(latestPkg.version)}`)
const tmp = mkdtempSync(join(tmpdir(), 'lune-share-'))
const tgz = join(tmp, 'src.tgz')
const bytes = await fetch(`https://github.com/${REPO}/archive/refs/heads/main.tar.gz`).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null)
if (!bytes) die('Download failed.')
writeFileSync(tgz, Buffer.from(bytes))
// tar ships with macOS and with Windows 10+ (tar.exe), so no extra dependency
if (spawnSync('tar', ['-xzf', tgz, '-C', tmp], { stdio: 'inherit' }).status !== 0) die('Could not extract the download.')
const srcDir = join(tmp, readdirSync(tmp).find((n) => n.startsWith('lune-share')) ?? '')
if (!existsSync(join(srcDir, 'package.json'))) die('Unexpected download layout.')
console.log(c.g('  ✓ downloaded'))

console.log('\n[2/5] Copying new files over this folder ' + c.d('(keeping ' + KEEP.filter((k) => existsSync(k)).join(', ') + ')'))
const keep = new Set(KEEP.map((k) => k.replace(/\\/g, '/')))
const copy = (rel) => {
  const from = join(srcDir, rel), to = rel
  if (keep.has(rel.replace(/\\/g, '/'))) return
  if (statSync(from).isDirectory()) { for (const n of readdirSync(from)) copy(join(rel, n)) }
  else cpSync(from, to)
}
for (const n of readdirSync(srcDir)) copy(n)
for (const r of REMOVE) if (existsSync(r)) rmSync(r)
rmSync(tmp, { recursive: true, force: true })
console.log(c.g('  ✓ files updated'))

console.log('\n[3/5] Installing dependencies')
if (!run('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'])) die('npm install failed. Run it again; it is usually the network.')

console.log('\n[4/5] Database migrations')
if (!run('node', ['scripts/migrate.mjs'])) die('Migration failed. Your site still runs the previous version; run `npm run update` again once the problem is fixed.')

console.log('\n[5/5] Build and deploy')
if (!run('npm', ['run', 'deploy'])) die('Deploy failed.')
console.log(`\n${c.g(c.b('Updated to ' + latestPkg.version + '.'))} Reload your site (hard refresh) to see it.`)
