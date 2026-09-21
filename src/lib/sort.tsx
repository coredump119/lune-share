import type { Prompt } from './api'
export type SortDir = 'new' | 'old'
const KEY = 'ls_sort'
export function loadSort(): SortDir { try { return localStorage.getItem(KEY) === 'old' ? 'old' : 'new' } catch { return 'new' } }
export function saveSort(d: SortDir) { try { localStorage.setItem(KEY, d) } catch { /* ignore */ } }
/** pinned prompts stay on top (newest pin first); the rest follow creation time */
export function sortPrompts(list: Prompt[], dir: SortDir): Prompt[] {
  const pinned = list.filter((p) => p.sort > p.createdAt).sort((a, b) => b.sort - a.sort)
  const rest = list.filter((p) => p.sort <= p.createdAt).sort((a, b) => dir === 'new' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)
  return [...pinned, ...rest]
}
export function SortToggle({ dir, onChange }: { dir: SortDir; onChange: (d: SortDir) => void }) {
  return <button className="sortbtn" title="切换排序" onClick={() => { const d = dir === 'new' ? 'old' : 'new'; saveSort(d); onChange(d) }}>{dir === 'new' ? '最新优先 ↓' : '最早优先 ↑'}</button>
}
