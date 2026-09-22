#!/usr/bin/env node
/**
 * Maintainer: publish the tutorial site + download bundle to Cloudflare Pages (works in mainland China,
 * unlike GitHub Pages / raw.githubusercontent). Called by release.mjs; can also run alone.
 * Output: docs-dist/  = docs/* + lune-share-main.zip + latest.json + scripts/*.mjs + _headers
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }); if (r.status !== 0) process.exit(1); return r.stdout }
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
rmSync('docs-dist', { recursive: true, force: true }); mkdirSync('docs-dist/scripts', { recursive: true })
cpSync('docs', 'docs-dist', { recursive: true })
// changelog page, generated from CHANGELOG.md (the admin banner links here)
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/`([^`]+)`/g, '<code>$1</code>')
const body = readFileSync('CHANGELOG.md', 'utf8').split('\n').map((l) => l.startsWith('## ') ? `<h2>${esc(l.slice(3))}</h2>` : l.startsWith('- ') ? `<li>${esc(l.slice(2))}</li>` : l.startsWith('# ') || l.startsWith('```') || l.startsWith('  ') || !l.trim() ? '' : `<p>${esc(l)}</p>`).join('\n')
writeFileSync('docs-dist/changelog.html', `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LUNE Share · 更新记录</title><style>body{max-width:680px;margin:40px auto;padding:0 20px;font:16px/1.7 -apple-system,"PingFang SC",sans-serif;color:#2f2733;background:#f6eef2}h2{font-size:20px;margin:28px 0 6px}li{margin:4px 0}code{background:#f5dfe8;padding:1px 6px;border-radius:5px}a{color:#c9789a}</style></head><body><p><a href="./">← 回教程</a></p><h1>更新记录</h1>${body}</body></html>`)
// the zip a beginner downloads: same layout as GitHub's "Download ZIP" (top folder lune-share-main/)
sh('git', ['archive', '--format=zip', '--prefix=lune-share-main/', '-o', 'docs-dist/lune-share-main.zip', 'HEAD', '--', '.', ':!docs', ':!scripts/release.mjs', ':!scripts/publish-docs.mjs'])
for (const f of ['setup.mjs', 'update.mjs', 'migrate.mjs', 'deploy.mjs']) cpSync(`scripts/${f}`, `docs-dist/scripts/${f}`)
writeFileSync('docs-dist/latest.json', JSON.stringify({ version: pkg.version, zip: 'lune-share-main.zip', at: Date.now() }))
writeFileSync('docs-dist/_headers', '/*\n  Access-Control-Allow-Origin: *\n/latest.json\n  Cache-Control: no-store\n/scripts/*\n  Cache-Control: no-store\n/lune-share-main.zip\n  Cache-Control: no-store\n')
const out = sh('npx', ['--yes', 'wrangler', 'pages', 'deploy', 'docs-dist', '--project-name', 'lune-share-docs', '--commit-dirty=true'])
console.log('docs published:', pkg.version, out.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/)?.[0] ?? '')
