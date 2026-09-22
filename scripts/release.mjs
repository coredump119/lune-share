#!/usr/bin/env node
/**
 * Maintainer helper (not needed by people who deploy the template):
 *   node scripts/release.mjs patch|minor|major "one line of what changed" ["another line" …]
 * Bumps package.json, prepends a CHANGELOG entry, reminds about migrations, commits, tags, pushes, creates the GitHub release.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const [kind, ...notes] = process.argv.slice(2)
if (!/^(patch|minor|major)$/.test(kind ?? '') || !notes.length) { console.error('usage: node scripts/release.mjs patch|minor|major "what changed" [...]'); process.exit(1) }
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8' }); if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1) } return r.stdout.trim() }
if (sh('git', ['status', '--porcelain'])) { console.error('Commit or stash your changes first; release only bumps version + changelog.'); process.exit(1) }
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [a, b, c] = pkg.version.split('.').map(Number)
const next = kind === 'major' ? `${a + 1}.0.0` : kind === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`
// did migrations change since the last tag? then say so in the notes
const lastTag = spawnSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).stdout.trim()
const migChanged = lastTag ? sh('git', ['diff', '--name-only', lastTag, '--', 'migrations']).split('\n').filter(Boolean) : []
const latestMig = readdirSync('migrations').filter((f) => /^\d{4}_/.test(f)).sort().pop()
const lines = [...notes.map((n) => `- ${n}`), migChanged.length ? `- 数据库有变化（${migChanged.join(', ')}），升级时会自动迁移` : '- 数据库结构没有变化']
const date = new Date().toISOString().slice(0, 10)
pkg.version = next; writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')
const ch = readFileSync('CHANGELOG.md', 'utf8'); const at = ch.indexOf('\n## ')
writeFileSync('CHANGELOG.md', ch.slice(0, at) + `\n## ${next} · ${date}\n${lines.join('\n')}\n` + ch.slice(at))
sh('git', ['add', 'package.json', 'CHANGELOG.md'])
sh('git', ['-c', 'user.name=NullPointer', '-c', 'user.email=283828759+coredump119@users.noreply.github.com', 'commit', '-q', '-m', `${next}: ${notes[0]}`])
sh('git', ['tag', `v${next}`]); sh('git', ['push', '-q', 'origin', 'main', `v${next}`])
sh('gh', ['release', 'create', `v${next}`, '--title', next, '--notes', lines.join('\n')])
sh('node', ['scripts/publish-docs.mjs'])
console.log(`released ${next} (latest migration: ${latestMig}). Sites will see the update banner within a day.`)
