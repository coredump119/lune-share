#!/usr/bin/env node
/**
 * Versioned database migrations.
 *   node scripts/migrate.mjs           against the remote D1 named in wrangler.toml
 *   node scripts/migrate.mjs --local   against the local dev copy
 * A `schema_version` table remembers what has been applied; only newer files in migrations/ run.
 * Each file is plain SQL and ends with an INSERT into schema_version, so a file is either fully applied or not counted.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
const LOCAL = process.argv.includes('--local')
if (!existsSync('wrangler.toml')) { console.error('No wrangler.toml yet. Run `npm run setup` first.'); process.exit(1) }
const db = readFileSync('wrangler.toml', 'utf8').match(/database_name\s*=\s*"([^"]+)"/)?.[1]
if (!db) { console.error('wrangler.toml has no database_name.'); process.exit(1) }
const wr = (args) => { const r = spawnSync('npx', ['--yes', 'wrangler', 'd1', 'execute', db, LOCAL ? '--local' : '--remote', ...args], { encoding: 'utf8', shell: process.platform === 'win32' }); return { ok: r.status === 0, out: (r.stdout ?? '') + (r.stderr ?? '') } }
const q = (sql) => { const r = wr(['--command', sql, '--json']); if (!r.ok) throw new Error(r.out); const i = r.out.indexOf('['); return JSON.parse(r.out.slice(i))[0]?.results ?? [] }

// the version table is created outside the migrations so it exists before the first one runs
const t = wr(['--command', 'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)'])
if (!t.ok) { console.error(t.out); process.exit(1) }
const current = Number(q('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version')[0]?.v ?? 0)
const files = readdirSync('migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
const pending = files.filter((f) => Number(f.slice(0, 4)) > current)
console.log(`database "${db}" (${LOCAL ? 'local' : 'remote'}) is at version ${current}; ${pending.length} migration(s) to apply`)
for (const f of pending) {
  process.stdout.write(`  → ${f} … `)
  const r = wr([`--file=./migrations/${f}`, '--yes'])
  if (!r.ok) { console.log('FAILED'); console.error(r.out); process.exit(1) }
  console.log('ok')
}
console.log(`database is now at version ${Number(q('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version')[0]?.v ?? 0)}`)
