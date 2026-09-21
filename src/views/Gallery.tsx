import { useEffect, useMemo, useState } from 'react'
import { api, type Prompt, type Collection } from '../lib/api'
import { loadSort, sortPrompts, SortToggle, type SortDir } from '../lib/sort'
import { ExportModal } from '../ui/ExportModal'
import { useStore, go, useIsMobile } from '../store'
import { Masonry } from '../ui/Masonry'

export const title = (p: Prompt) => p.title?.trim() || (p.text.replace(/\s+/g, ' ').length > 48 ? p.text.replace(/\s+/g, ' ').slice(0, 48) + '…' : p.text.replace(/\s+/g, ' '))
export const fullText = (p: Prompt, withP: boolean) => p.text + (p.params ? ' ' + p.params : '') + (withP && p.p.length ? ' --p ' + p.p.map((x) => x.code).join(' ') : '')
export async function copy(s: string) { await navigator.clipboard.writeText(s) }

export function useGallery() {
  const [data, setData] = useState<{ prompts: Prompt[]; collections: Collection[] } | null>(null)
  const reload = async () => setData(await api.prompts())
  useEffect(() => { reload() }, [])
  return { data, reload }
}

export function PromptCard({ p, onOpen, draft, checked, onToggle }: { p: Prompt; onOpen: () => void; draft?: boolean; checked?: boolean; onToggle?: () => void }) {
  const { toast } = useStore()
  const [done, setDone] = useState(false)
  const cover = p.images[0]
  const ratio = cover ? Math.min(1.5, Math.max(0.72, cover.width / cover.height)) : 4 / 3
  return (
    <article className={'pcard glass' + (draft ? ' draft' : '') + (checked ? ' checked' : '') + (onToggle ? ' selecting' : '')} onClick={onToggle ?? onOpen}>
      <div className="pcard-media" style={{ ['--ratio' as string]: String(ratio) }}>
        {onToggle && <span className={'pcard-check' + (checked ? ' on' : '')}>{checked ? '✓' : ''}</span>}
        {cover && <img src={cover.url} alt="" loading="lazy" />}
        {p.images.length > 1 && <span className="pcard-badge">{p.images.length}</span>}
        <button className={'pcard-copy' + (done ? ' done' : '')} onClick={async (e) => { e.stopPropagation(); await copy(fullText(p, false)); setDone(true); toast('已复制'); setTimeout(() => setDone(false), 1200) }}>{done ? '已复制' : '复制'}</button>
      </div>
      <div className="pcard-body">
        <p className={'pcard-title' + (p.title ? '' : ' untitled')}>{title(p)}</p>
        {p.title && <p className="pcard-text">{p.text}</p>}
        {(p.tags.length > 0 || p.p.length > 0) && <div className="pcard-tags">{p.p.map((x) => <span key={x.code} className="chip p">{x.name}</span>)}{p.tags.slice(0, 4).map((t) => <span key={t} className="chip">#{t}</span>)}</div>}
      </div>
    </article>
  )
}

export function Detail({ p, onClose, admin, onEdit, actions }: { p: Prompt; onClose: () => void; admin?: boolean; onEdit?: () => void; actions?: React.ReactNode }) {
  const { toast } = useStore()
  const [idx, setIdx] = useState(0)
  const [lb, setLb] = useState(false)
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (lb) setLb(false); else onClose() } if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + p.images.length) % p.images.length); if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % p.images.length) }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [onClose, p.images.length, lb])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className={'sheet glass-strong' + (p.images.length ? '' : ' no-media')}>
        <div className="sheet-top"><button className="btn" onClick={onClose} aria-label="关闭">×</button>{admin && <button className="btn" style={{ width: 'auto', padding: '0 12px' }} onClick={onEdit}>编辑</button>}</div>
        {p.images.length > 0 && (
          <div className="sheet-media">
            <div className="sheet-hero"><img src={p.images[idx]?.url} alt="" onClick={() => setLb(true)} style={{ cursor: 'zoom-in' }} /></div>
            {p.images.length > 1 && <div className="sheet-thumbs">{p.images.map((im, i) => <img key={im.id} src={im.url} alt="" className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />)}</div>}
          </div>
        )}
        <div className="sheet-body">
          <h2 className="sheet-title">{title(p)}</h2>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn accent" onClick={async () => { await copy(fullText(p, false)); toast('已复制 prompt') }}>复制 Prompt</button>
            {p.p.length > 0 && <button className="btn" onClick={async () => { await copy(fullText(p, true)); toast('已复制，含 --p') }}>复制 + --p</button>}
          </div>
          {admin && actions && <div className="row" style={{ flexWrap: 'wrap' }}>{actions}</div>}
          {p.author && <p className="tiny">投稿 · {p.author}{admin && !p.published ? ' · 待审核' : ''}</p>}
          <section><span className="label">Prompt</span><pre className="pre">{p.text}</pre></section>
          {p.params && <section><span className="label">参数</span><pre className="pre">{p.params}</pre></section>}
          {p.p.length > 0 && <section><span className="label">Personalization</span><div className="row" style={{ flexWrap: 'wrap' }}>{p.p.map((x) => <span key={x.code} className="chip p">{x.name} · {x.code}</span>)}</div></section>}
          {p.tags.length > 0 && <section><span className="label">标签</span><div className="row" style={{ flexWrap: 'wrap' }}>{p.tags.map((t) => <span key={t} className="chip">#{t}</span>)}</div></section>}
          {p.note && <section><span className="label">备注</span><p style={{ whiteSpace: 'pre-wrap' }}>{p.note}</p></section>}
          <p className="tiny">{new Date(p.createdAt).toLocaleDateString('zh-CN')}</p>
        </div>
      </aside>
      {lb && (
        <div className="lb" onClick={() => setLb(false)}>
          <span className="cnt">{idx + 1} / {p.images.length}</span>
          <button className="nav x" aria-label="关闭">×</button>
          {p.images.length > 1 && <button className="nav prev" onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + p.images.length) % p.images.length) }}>‹</button>}
          <img src={p.images[idx]?.url} alt="" onClick={(e) => e.stopPropagation()} />
          {p.images.length > 1 && <button className="nav next" onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % p.images.length) }}>›</button>}
        </div>
      )}
    </>
  )
}

export function TopBar({ right, mobileRight }: { right?: React.ReactNode; mobileRight?: React.ReactNode }) {
  const { auth, theme, setTheme, dark } = useStore()
  const mobile = useIsMobile()
  return (
    <div className="top">
      <div className="bar glass">
        <a className="brand" href="#/g">{auth?.site.name ?? ''}</a>
        {mobile ? mobileRight ?? right : right}
        <button className="icon-btn" title="深浅色" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label="切换深浅色">{theme === 'auto' ? '◐' : dark ? '☾' : '☼'}</button>
        {auth?.admin && <a className="icon-btn" href="#/admin" title="后台">⚙</a>}
      </div>
    </div>
  )
}

export function Gallery() {
  const { route, auth, toast } = useStore()
  const mobile = useIsMobile()
  const [contrib, setContrib] = useState(false)
  const [exporting, setExporting] = useState(false)
  const { data } = useGallery()
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [col, setCol] = useState<string | null>(null)
  const [dir, setDir] = useState<SortDir>(loadSort)
  const openId = route.name === 'gallery' ? route.id : undefined
  const list = useMemo(() => {
    if (!data) return []
    let l = data.prompts
    if (col) l = l.filter((p) => p.collectionId === col)
    if (tag) l = l.filter((p) => p.tags.includes(tag))
    const s = q.trim().toLowerCase()
    if (s) l = l.filter((p) => [p.title ?? '', p.text, p.params ?? '', ...p.tags, ...p.p.map((x) => x.name)].join(' ').toLowerCase().includes(s))
    return sortPrompts(l, dir)
  }, [data, q, tag, col, dir])
  const tags = useMemo(() => { const m = new Map<string, number>(); (data?.prompts ?? []).filter((p) => !col || p.collectionId === col).forEach((p) => p.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1))); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t) }, [data, col])
  const open = data?.prompts.find((p) => p.id === openId)
  const heading = [col ? data?.collections.find((c) => c.id === col)?.name : null, tag ? `#${tag}` : null].filter(Boolean).join(' · ') || (auth?.site.name ?? '')
  return (
    <div className="main">
      <TopBar right={<><div className="search"><span>⌕</span><input placeholder="搜索…" value={q} onChange={(e) => setQ(e.target.value)} /></div>{auth?.canPost && !auth.admin && <button className="btn sm" onClick={() => setContrib(true)}>投稿</button>}</>}
        mobileRight={<><div className="search"><span>⌕</span><input placeholder="搜索…" value={q} onChange={(e) => setQ(e.target.value)} /></div>{auth?.canPost && !auth.admin && <button className="icon-btn" title="投稿" onClick={() => setContrib(true)}>＋</button>}</>} />
      <div className="page">
        <div className="head"><span className="eyebrow">{list.length} prompts</span><h1>{heading}</h1><div className="row" style={{ gap: 6, justifyContent: 'center' }}><SortToggle dir={dir} onChange={setDir} />{auth?.canExport && list.length > 0 && <button className="sortbtn" onClick={() => setExporting(true)}>导出 ⤓</button>}</div></div>
        {data && data.collections.length > 0 && (
          <div className="frow"><button className={'fchip' + (!col ? ' on' : '')} onClick={() => setCol(null)}>全部</button>{data.collections.map((c) => <button key={c.id} className={'fchip' + (col === c.id ? ' on' : '')} onClick={() => setCol(col === c.id ? null : c.id)}>{c.name}</button>)}</div>
        )}
        {tags.length > 0 && <div className="frow" style={{ marginTop: -14 }}>{tags.slice(0, 18).map((t) => <button key={t} className={'ftag' + (tag === t ? ' on' : '')} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}</div>}
        {!data ? <p className="tiny" style={{ textAlign: 'center' }}>加载中…</p> : list.length === 0 ? <p className="muted" style={{ textAlign: 'center', padding: 60 }}>还没有内容</p> : (
          <Masonry minWidth={mobile ? 150 : 250} gap={mobile ? 10 : 18} items={list.map((p) => <PromptCard key={p.id} p={p} onOpen={() => go(`/g/${p.id}`)} />)} />
        )}
      </div>
      {open && <Detail p={open} onClose={() => go('/g')} />}
      {exporting && data && <ExportModal prompts={list} collections={data.collections} name={heading} toast={toast} onClose={() => setExporting(false)} />}
      {contrib && <ContribModal collections={data?.collections ?? []} onClose={() => setContrib(false)} />}
    </div>
  )
}

function ContribModal({ collections, onClose }: { collections: Collection[]; onClose: () => void }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal glass-strong">
        <div className="modal-head"><h2>投稿</h2><span className="tiny">审核通过后出现在词包里</span></div>
        <PromptFormLazy collections={collections} onClose={onClose} />
      </div>
    </div>
  )
}
import { lazy, Suspense } from 'react'
const AdminForm = lazy(() => import('./Admin').then((m) => ({ default: m.PromptForm })))
function PromptFormLazy({ collections, onClose }: { collections: Collection[]; onClose: () => void }) {
  return <Suspense fallback={<p className="tiny">加载中…</p>}><AdminForm contrib collections={collections} onCancel={onClose} onSaved={() => onClose()} /></Suspense>
}
