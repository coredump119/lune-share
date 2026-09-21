#!/usr/bin/env node
/** Publish the built site to the Pages project named in wrangler.toml. */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
if (!existsSync('wrangler.toml')) { console.error('No wrangler.toml yet. Run `npm run setup` first.'); process.exit(1) }
const name = readFileSync('wrangler.toml', 'utf8').match(/^name\s*=\s*"([^"]+)"/m)?.[1]
if (!name) { console.error('wrangler.toml has no name = "…" line.'); process.exit(1) }
const [, , sub] = process.argv
const args = sub === 'db' ? ['d1', 'execute', name, '--remote', '--file=./schema.sql', '--yes'] : ['pages', 'deploy', 'dist', '--project-name', name, '--commit-dirty=true']
process.exit(spawnSync('npx', ['--yes', 'wrangler', ...args], { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1)
