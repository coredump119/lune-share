import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type Prompt, type Collection, type Invite } from '../lib/api'
import { loadSort, sortPrompts, SortToggle, type SortDir } from '../lib/sort'
import { useStore, go, useIsMobile } from '../store'
import { readImagePrompt, splitDescription } from '../lib/mjmeta'
import { reencode, filesFromDataTransfer, fmtBytes } from '../lib/image'
import { Masonry } from '../ui/Masonry'
import { PromptCard, Detail, TopBar } from './Gallery'

const TABS = [['upload', '上传'], ['content', '内容'], ['invites', '邀请码'], ['import', '导入'], ['usage', '用量']] as const

export function Admin() {
  const { auth, route, refreshAuth } = useStore()
  const tab = route.name === 'admin' ? route.tab ?? 'upload' : 'upload'
  const mobile = useIsMobile()
  if (!auth?.admin) return <AdminLogin onDone={refreshAuth} />
  return (
    <div className={'main' + (mobile ? ' has-bottomnav' : '')}>
      <TopBar right={<div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(`/admin/${k}`)}>{l}</button>)}</div>} mobileRight={<span className="eyebrow" style={{ marginLeft: 'auto', marginRight: 6 }}>admin</span>} />
      {mobile && <nav className="bottomnav glass-strong">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(`/admin/${k}`)}>{l}</button>)}</nav>}
      <div className="page" style={{ maxWidth: 1100 }}>
        {tab === 'upload' && <Upload />}
        {tab === 'content' && <Content />}
        {tab === 'invites' && <Invites />}
        {tab === 'import' && <Import />}
        {tab === 'usage' && <Usage />}
      </div>
    </div>
  )
}

function AdminLogin({ onDone }: { onDone: () => Promise<void> }) {
  const { auth } = useStore()
  const [s, setS] = useState(''); const [err, setErr] = useState<string | null>(null)
  return (
    <div className="gate">
      <form className="gate-card glass-strong fade-in" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.adminLogin(s); await onDone() } catch (er) { setErr((er as Error).message) } }}>
        <span className="eyebrow">{auth?.site.name} · Admin</span>
        <h1 style={{ fontSize: 36 }}>管理密钥</h1>
        <input className="field" type="password" autoFocus value={s} onChange={(e) => setS(e.target.value)} placeholder="ADMIN_SECRET" style={{ letterSpacing: '0.1em' }} />
        {err && <span className="err">{err}</span>}
        <button className="btn primary" type="submit" style={{ width: '100%', height: 44 }}>登录</button>
        <a className="tiny" href="#/">返回</a>
      </form>
    </div>
  )
}

/* ---------------- upload / edit ---------------- */
interface Pending { file?: File; url: string; id?: string; width?: number; height?: number }
export function PromptForm({ initial, onSaved, onCancel, collections, contrib, onCollectionsChanged }: { initial?: Prompt; onSaved: (p: Prompt | null) => void; onCancel?: () => void; collections: Collection[]; contrib?: boolean; onCollectionsChanged?: () => Promise<void> | void }) {
  const { toast } = useStore()
  const [text, setText] = useState(initial?.text ?? '')
  const [ttl, setTtl] = useState(initial?.title ?? '')
  const [params, setParams] = useState(initial?.params ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [col, setCol] = useState(initial?.collectionId ?? '')
  const [showP, setShowP] = useState(initial?.showP ?? false)
  const [published, setPublished] = useState(initial?.published ?? true)
  const [pList, setPList] = useState<{ name: string; code: string }[]>(initial?.p ?? [])
  const [imgs, setImgs] = useState<Pending[]>((initial?.images ?? []).map((i) => ({ url: i.url, id: i.id, width: i.width, height: i.height })))
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const addFiles = async (files: File[]) => {
    if (!files.length) return
    setImgs((s) => [...s, ...files.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
    if (!text.trim()) {
      for (const f of files) {
        const r = await readImagePrompt(f)
        if (r) { setText(r.text); if (r.params) setParams(r.params); if (r.pCodes.length) { setPList((cur) => [...cur, ...r.pCodes.filter((c) => !cur.some((x) => x.code === c)).map((c) => ({ name: c, code: c }))]); toast(`读到 --p ${r.pCodes.join(' ')}，默认不公开`) } break }
      }
    }
  }
  // ⌘V / Ctrl+V anywhere on the page while the form is open: images on the clipboard go straight into the form.
  // Text pastes are left alone so typing into fields keeps working.
  const addRef = useRef(addFiles); addRef.current = addFiles
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData; if (!dt) return
      // dt.files and dt.items describe the SAME clipboard entries; reading both doubles every image
      // (getAsFile() mints a fresh File with its own lastModified, so comparing fields can't dedupe them).
      const raw = dt.files.length ? Array.from(dt.files) : Array.from(dt.items).filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f)
      const uniq = raw.filter((f) => f.type.startsWith('image/'))
      if (!uniq.length) return
      e.preventDefault()
      const stamp = Date.now()
      addRef.current(uniq.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `pasted-${stamp}-${i}.${f.type.split('/')[1] || 'png'}`, { type: f.type, lastModified: f.lastModified })))
      toast(`已粘贴 ${uniq.length} 张图片`)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [toast])
  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const it of items) { const t = it.types.find((x) => x.startsWith('image/')); if (t) { const b = await it.getType(t); files.push(new File([b], `pasted-${Date.now()}-${files.length}.${t.split('/')[1] || 'png'}`, { type: t })) } }
      if (!files.length) { toast('剪贴板里没有图片'); return }
      await addFiles(files); toast(`已粘贴 ${files.length} 张图片`)
    } catch { toast('浏览器没给剪贴板权限，直接按 ⌘V 也可以') }
  }
  const splitParams = () => { if (!/\s--[a-z]/i.test(text)) return; const r = splitDescription(text); if (!r.text.trim()) return; setText(r.text); if (r.params) setParams((c) => (c ? c + ' ' + r.params : r.params)); if (r.pCodes.length) setPList((cur) => [...cur, ...r.pCodes.filter((c) => !cur.some((x) => x.code === c)).map((c) => ({ name: c, code: c }))]) }
  const save = async () => {
    if (!text.trim()) { toast('prompt 不能为空'); return }
    setBusy('上传图片…')
    try {
      const ids: string[] = []
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i]
        if (im.id) { ids.push(im.id); continue }
        setBusy(`上传图片 ${i + 1} / ${imgs.length}`)
        const { blob, width, height } = await reencode(im.file!)
        const up = await api.uploadImage(blob, width, height, contrib)
        ids.push(up.id)
      }
      setBusy('保存…')
      const body = { title: ttl, text, params, note, collectionId: col || null, showP, published, tags: tags.split(/[,，\s]+/).filter(Boolean), p: pList, imageIds: ids }
      if (contrib) { await api.contribPrompt(body); toast('已提交，等审核通过后会出现在词包里', 6000); onSaved(null) }
      else { const r = initial ? await api.updatePrompt(initial.id, body) : await api.createPrompt(body); toast(initial ? '已保存' : '已发布'); onSaved(r.prompt) }
      if (!initial) { setText(''); setTtl(''); setParams(''); setNote(''); setTags(''); setPList([]); setImgs([]) }
    } catch (e) { toast('失败：' + (e as Error).message, 6000) } finally { setBusy(null) }
  }
  return (
    <div className="stack">
      <div className={'drop' + (over ? ' over' : '')} onClick={() => fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(filesFromDataTransfer(e.dataTransfer)) }}>
        {imgs.length ? (
          <div className="thumbrow" style={{ justifyContent: 'center' }}>{imgs.map((im, i) => <span key={im.url} className="rm"><img src={im.url} alt="" /><button onClick={(e) => { e.stopPropagation(); setImgs((s) => s.filter((_, j) => j !== i)) }}>×</button></span>)}</div>
        ) : <span>拖 MJ 原图进来、点击选择，或直接 ⌘V 粘贴 · 会自动读出完整 prompt，图片在浏览器里重新编码后再上传</span>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>
      <div className="row" style={{ justifyContent: 'center', marginTop: -6 }}><button type="button" className="btn ghost sm" onClick={pasteFromClipboard}>粘贴剪贴板里的图片</button></div>
      <div><span className="label">Prompt *</span><textarea className="field mono" rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={splitParams} placeholder="带 --ar 之类参数也行，会自动拆到参数栏" /></div>
      <div className="cols">
        <div><span className="label">标题（可选）</span><input className="field" value={ttl} onChange={(e) => setTtl(e.target.value)} /></div>
        <div><span className="label">参数</span><input className="field mono" value={params} onChange={(e) => setParams(e.target.value)} placeholder="--ar 16:9 --v 7" /></div>
        <div><span className="label">标签（逗号分隔）</span><input className="field" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="古风, 少年" /></div>
        <div><span className="label">集合</span><select className="field" value={col} onChange={async (e) => { const v = e.target.value; if (v !== '__new') { setCol(v); return } const n = prompt('新集合名')?.trim(); if (!n) return; const hit = collections.find((c) => c.name === n); if (hit) { setCol(hit.id); return } const r = await api.collection({ name: n }); await onCollectionsChanged?.(); if (r.id) setCol(r.id) }}><option value="">不分组</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{!contrib && <option value="__new">＋ 新建集合…</option>}</select></div>
      </div>
      {!contrib && <div><span className="label">P 值（{pList.length} 个）</span>
        <div className="row" style={{ flexWrap: 'wrap' }}>{pList.map((p, i) => <span key={p.code} className="chip p">{p.name}{p.name !== p.code ? ` · ${p.code}` : ''}<button onClick={() => setPList((s) => s.filter((_, j) => j !== i))} style={{ marginLeft: 4 }}>×</button></span>)}
          <button className="btn sm ghost" onClick={() => { const code = prompt('--p code'); if (!code) return; const name = prompt('给它起个名字', code) || code; setPList((s) => [...s, { name, code }]) }}>+ 添加</button></div>
        <label className="row" style={{ marginTop: 8 }}><input type="checkbox" className="switch" checked={showP} onChange={(e) => setShowP(e.target.checked)} /><span>公开 P 值（访客能看到并复制 --p）</span></label>
      </div>}
      <div><span className="label">备注</span><textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {contrib ? <span className="tiny">投稿会先进入待审核，通过后才会出现</span> : <label className="row"><input type="checkbox" className="switch" checked={published} onChange={(e) => setPublished(e.target.checked)} /><span>发布（关掉则只有你能看到）</span></label>}
        <div className="row">{onCancel && <button className="btn ghost" onClick={onCancel}>取消</button>}<button className="btn primary" onClick={save} disabled={!!busy}>{busy ?? (contrib ? '提交投稿' : initial ? '保存' : '发布')}</button></div>
      </div>
    </div>
  )
}

function useCollections() {
  const [cols, setCols] = useState<Collection[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const reload = async () => {
    const d = await api.prompts()
    setCols(d.collections)
    const m: Record<string, number> = {}
    d.prompts.forEach((p) => { if (p.collectionId) m[p.collectionId] = (m[p.collectionId] ?? 0) + 1 })
    setCounts(m)
  }
  useEffect(() => { reload() }, [])
  return { cols, counts, reload }
}

function Upload() {
  const { cols, counts, reload } = useCollections()
  return (
    <div className="stack">
      <div className="head"><span className="eyebrow">admin · upload</span><h1>新建</h1></div>
      <div className="card glass"><PromptForm collections={cols} onCollectionsChanged={reload} onSaved={() => { /* stays for the next one */ }} /></div>
      <div className="card glass"><CollectionManager cols={cols} counts={counts} reload={reload} /></div>
    </div>
  )
}

function CollectionManager({ cols, counts, reload }: { cols: Collection[]; counts: Record<string, number>; reload: () => Promise<void> | void }) {
  const { toast } = useStore()
  const [name, setName] = useState('')
  const [del, setDel] = useState<Collection | null>(null)
  const doDelete = async (withPrompts: boolean) => { if (!del) return; const r = await api.collection({ id: del.id, delete: true, withPrompts }); setDel(null); await reload(); toast(withPrompts ? `已删除集合和 ${r.deleted ?? 0} 条 prompt` : '已删除集合，prompt 已变为不分组') }
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const create = async () => { const n = name.trim(); if (!n) return; if (cols.some((c) => c.name === n)) { toast('已有同名集合'); return } await api.collection({ name: n }); setName(''); await reload(); toast('已新建集合') }
  const busy = useRef(false)
  const rename = async (c: Collection) => { if (busy.current) return; busy.current = true; setTimeout(() => { busy.current = false }, 300); const n = draft.trim(); setEditing(null); if (!n || n === c.name) return; if (cols.some((x) => x.id !== c.id && x.name === n)) { toast('已有同名集合'); return } await api.collection({ id: c.id, name: n }); await reload(); toast('已改名') }
  const move = async (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= cols.length) return; const next = [...cols]; [next[i], next[j]] = [next[j], next[i]]; await Promise.all(next.map((c, k) => c.sort === k ? null : api.collection({ id: c.id, sort: k }))); await reload() }
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>集合</h3><span className="tiny">点名字可改名 · 邀请码按集合授权</span></div>
      {cols.length === 0 && <p className="tiny">还没有集合。新建一个，或从 LUNE 导入时会自动按文件夹建好。</p>}
      <div className="col-list">
        {cols.map((c, i) => (
          <div key={c.id} className="col-row">
            {editing === c.id
              ? <input className="field" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => rename(c)} onKeyDown={(e) => { if (e.key === 'Enter') rename(c); if (e.key === 'Escape') setEditing(null) }} />
              : <button className="col-name" title="改名" onClick={() => { setEditing(c.id); setDraft(c.name) }}>{c.name}<span className="tiny" style={{ marginLeft: 8 }}>{counts[c.id] ?? 0} 条</span></button>}
            <div className="row" style={{ gap: 2 }}>
              <button className="btn ghost sm" aria-label="上移" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn ghost sm" aria-label="下移" disabled={i === cols.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="btn ghost sm" onClick={() => { setEditing(c.id); setDraft(c.name) }}>改名</button>
              <button className="btn ghost sm danger" onClick={() => setDel(c)}>删除</button>
            </div>
          </div>
        ))}
      </div>
      <div className="row"><input className="field" style={{ flex: 1, minWidth: 0 }} placeholder="新集合名" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create() }} /><button className="btn primary" disabled={!name.trim()} onClick={create}>新建</button></div>
      {del && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDel(null) }}>
          <div className="modal glass-strong" style={{ width: 460 }}>
            <div className="modal-head"><h2>删除集合「{del.name}」</h2></div>
            <p className="tiny" style={{ margin: '4px 0 14px' }}>里面有 {counts[del.id] ?? 0} 条 prompt。相关邀请码对这个集合的授权会一并移除。</p>
            <div className="stack" style={{ gap: 8 }}>
              <button className="btn danger" style={{ width: '100%', justifyContent: 'center' }} onClick={() => doDelete(true)}>连同 {counts[del.id] ?? 0} 条 prompt 和图片一起删除</button>
              <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => doDelete(false)}>只删集合，prompt 保留为「不分组」</button>
              <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setDel(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Content() {
  const { toast } = useStore()
  const mobile = useIsMobile()
  const [filter, setFilter] = useState<'all' | 'pending'>('all')
  const [dir, setDir] = useState<SortDir>(loadSort)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const runBatch = async (action: 'approve' | 'unpublish' | 'delete' | 'pin' | 'unpin') => {
    if (!sel.size) return
    if (action === 'delete' && !confirm(`删除选中的 ${sel.size} 条？图片也会删掉`)) return
    const r = await api.batch([...sel], action)
    toast(`${action === 'delete' ? '已删除' : action === 'approve' ? '已发布' : action === 'unpublish' ? '已下架' : action === 'pin' ? '已置顶' : '已取消置顶'} ${r.n} 条`)
    setSel(new Set()); setSelecting(false); reload()
  }
  const [data, setData] = useState<{ prompts: Prompt[]; collections: Collection[] } | null>(null)
  const [open, setOpen] = useState<Prompt | null>(null)
  const [edit, setEdit] = useState<Prompt | null>(null)
  const reload = async () => setData(await api.prompts())
  useEffect(() => { reload() }, [])
  return (
    <div className="stack">
      <div className="head"><span className="eyebrow">admin · {data?.prompts.length ?? 0} prompts</span><h1>内容</h1><SortToggle dir={dir} onChange={setDir} /></div>
      <div className="frow"><button className={'fchip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>全部</button><button className={'fchip' + (filter === 'pending' ? ' on' : '')} onClick={() => setFilter('pending')}>待审核 {data ? data.prompts.filter((p) => !p.published && p.authorInvite).length : ''}</button><button className={'fchip' + (selecting ? ' on' : '')} onClick={() => { setSelecting((s) => !s); setSel(new Set()) }}>{selecting ? '完成' : '选择'}</button></div>
      {data && (() => { const shown = sortPrompts(data.prompts.filter((p) => filter === 'all' || (!p.published && p.authorInvite)), dir); return (
        <>
          <Masonry minWidth={mobile ? 150 : 250} gap={mobile ? 10 : 18} items={shown.map((p) => <PromptCard key={p.id} p={p} draft={!p.published} onOpen={() => setOpen(p)} checked={sel.has(p.id)} onToggle={selecting ? () => toggle(p.id) : undefined} />)} />
          {selecting && (
            <div className="selbar glass-strong">
              <span className="tiny" style={{ color: 'var(--ink-strong)' }}>{sel.size ? `已选 ${sel.size}` : '点卡片来选'}</span>
              <button className="btn sm ghost" onClick={() => setSel(new Set(shown.map((p) => p.id)))}>全选</button>
              <button className="btn sm" disabled={!sel.size} onClick={() => runBatch('approve')}>通过并发布</button>
              <button className="btn sm" disabled={!sel.size} onClick={() => runBatch('unpublish')}>下架</button>
              <button className="btn sm" disabled={!sel.size} onClick={() => runBatch('pin')}>置顶</button>
              <button className="btn sm danger" disabled={!sel.size} onClick={() => runBatch('delete')}>删除</button>
            </div>
          )}
        </>
      ) })()}
      {open && !edit && <Detail p={open} onClose={() => setOpen(null)} admin onEdit={() => setEdit(open)} actions={<>
        {!open.published && <button className="btn accent" onClick={async () => { const r = await api.promptAction(open.id, 'approve'); setOpen(r.prompt); reload(); toast('已发布') }}>通过并发布</button>}
        {open.published && <button className="btn" onClick={async () => { const r = await api.promptAction(open.id, 'unpublish'); setOpen(r.prompt); reload(); toast('已下架') }}>下架</button>}
        <button className="btn" onClick={async () => { const pinned = open.sort > open.createdAt; const r = await api.promptAction(open.id, pinned ? 'unpin' : 'pin'); setOpen(r.prompt); reload(); toast(pinned ? '已取消置顶' : '已置顶') }}>{open.sort > open.createdAt ? '取消置顶' : '置顶'}</button>
      </>} />}
      {edit && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null) }}>
          <div className="modal glass-strong">
            <div className="modal-head"><h2>编辑</h2><button className="btn sm danger" onClick={async () => { if (confirm('删除这条？图片也会删掉')) { await api.deletePrompt(edit.id); setEdit(null); setOpen(null); reload(); toast('已删除') } }}>删除</button></div>
            <PromptForm initial={edit} collections={data?.collections ?? []} onCollectionsChanged={reload} onCancel={() => setEdit(null)} onSaved={(p) => { setEdit(null); setOpen(p); reload() }} />
          </div>
        </div>
      )}
    </div>
  )
}

function Invites() {
  const { toast } = useStore()
  const { cols } = useCollections()
  const [list, setList] = useState<Invite[]>([])
  const [scopeAll, setScopeAll] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [editScope, setEditScope] = useState<Invite | null>(null)
  const ScopePicker = ({ all, setAll, sel, setSel }: { all: boolean; setAll: (b: boolean) => void; sel: string[]; setSel: (s: string[]) => void }) => (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button className={'fchip' + (all ? ' on' : '')} onClick={() => setAll(true)}>全部集合</button>
        {cols.map((c) => <button key={c.id} className={'fchip' + (!all && sel.includes(c.id) ? ' on' : '')} onClick={() => { setAll(false); setSel(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]) }}>{c.name}</button>)}
      </div>
      <span className="tiny">{all ? '能看到所有集合，包括没分组的 prompt' : sel.length ? `只能看到：${sel.map((id) => cols.find((c) => c.id === id)?.name).filter(Boolean).join('、')}；没分组的看不到` : '还没选集合，这个码进去会是空的'}</span>
    </div>
  )
  const [label, setLabel] = useState('')
  const [days, setDays] = useState('')
  const [maxDev, setMaxDev] = useState('3')
  const [fresh, setFresh] = useState<{ code: string; label: string } | null>(null)
  const [canPost, setCanPost] = useState(false)
  const [detail, setDetail] = useState<{ id: string; sessions: { device_id: string; created_at: number; last_seen_at: number; ua: string }[]; log: { at: number; action: string }[] } | null>(null)
  const reload = async () => setList((await api.invites()).invites)
  useEffect(() => { reload() }, [])
  const fmt = (t: number | null) => (t ? new Date(t).toLocaleDateString('zh-CN') : '—')
  return (
    <div className="stack">
      <div className="head"><span className="eyebrow">admin · {list.filter((i) => !i.revoked_at).length} active</span><h1>邀请码</h1></div>
      <div className="card glass">
        <h3>生成一个</h3>
        <div className="cols">
          <div><span className="label">给谁（备注名）</span><input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="小 A" /></div>
          <div className="cols"><div><span className="label">有效天数（空 = 不过期）</span><input className="field" value={days} onChange={(e) => setDays(e.target.value)} placeholder="30" inputMode="numeric" /></div><div><span className="label">设备上限</span><input className="field" value={maxDev} onChange={(e) => setMaxDev(e.target.value)} inputMode="numeric" /></div></div>
        </div>
        <div><span className="label">能看哪些集合</span><ScopePicker all={scopeAll} setAll={setScopeAll} sel={picked} setSel={setPicked} /></div>
        <label className="row"><input type="checkbox" className="switch" checked={canPost} onChange={(e) => setCanPost(e.target.checked)} /><span>投稿码：持码人可以上传到它能看的集合，进待审核后你再发布</span></label>
        <div className="row"><button className="btn primary" onClick={async () => { const r = await api.createInvite({ label, expires_at: days ? Date.now() + Number(days) * 86400000 : null, max_devices: Number(maxDev) || 3, can_post: canPost, collections: scopeAll ? 'all' : picked }); setFresh({ code: r.code, label: r.label }); setLabel(''); reload() }}>生成</button><span className="tiny">明文只显示这一次，库里只存哈希</span></div>
        {fresh && <div className="stack" style={{ gap: 8 }}><div className="code-show">{fresh.code}</div><div className="row"><button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(fresh.code); toast('已复制邀请码') }}>复制</button><span className="tiny">发给 {fresh.label || '对方'}，之后这里再也看不到明文</span></div></div>}
      </div>
      <div className="card glass" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead><tr><th>备注</th><th>可见集合</th><th>创建</th><th>过期</th><th>设备</th><th>最近使用</th><th>投稿</th><th>状态</th><th></th></tr></thead>
          <tbody>{list.map((i) => (
            <tr key={i.id} style={{ opacity: i.revoked_at ? 0.5 : 1 }}>
              <td>{i.label || <span className="tiny">（无）</span>}</td>
              <td><button className="chip clickable" onClick={() => setEditScope(i)}>{i.scope === 'all' ? '全部' : `${i.collections.length} 个集合`}</button></td>
              <td>{fmt(i.created_at)}</td><td>{fmt(i.expires_at)}</td>
              <td>{i.devices} / {i.max_devices}</td><td>{i.last_seen ? new Date(i.last_seen).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
              <td><input type="checkbox" className="switch" checked={!!i.can_post} onChange={async (e) => { await api.patchInvite(i.id, { can_post: e.target.checked }); reload() }} /></td>
              <td>{i.revoked_at ? '已作废' : i.expires_at && i.expires_at < Date.now() ? '已过期' : '有效'}</td>
              <td className="row" style={{ justifyContent: 'flex-end' }}>
                {i.revoked_at ? <button className="btn sm" onClick={async () => { await api.patchInvite(i.id, { restore: true }); reload() }}>恢复</button> : <button className="btn sm danger" onClick={async () => { if (confirm(`作废「${i.label || i.id}」？用它登录的设备会立刻掉线`)) { await api.patchInvite(i.id, { revoke: true }); reload(); toast('已作废') } }}>作废</button>}
                <button className="btn sm ghost" onClick={async () => { const d = await api.inviteDetail(i.id); setDetail({ id: i.id, ...d }) }}>详情</button>
                <button className="btn sm ghost" onClick={async () => { if (confirm('彻底删除这个码和它的记录？')) { await api.deleteInvite(i.id); reload() } }}>删除</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
        {!list.length && <p className="tiny">还没有邀请码</p>}
      </div>
      {editScope && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditScope(null) }}>
          <div className="modal glass-strong" style={{ width: 560 }}>
            <div className="modal-head"><h2>可见集合 · {editScope.label || '未命名'}</h2></div>
            <ScopePicker all={editScope.scope === 'all'} setAll={(b) => setEditScope({ ...editScope, scope: b ? 'all' : 'some' })} sel={editScope.collections} setSel={(s) => setEditScope({ ...editScope, scope: 'some', collections: s })} />
            <div className="modal-foot"><button className="btn ghost" onClick={() => setEditScope(null)}>取消</button><button className="btn primary" onClick={async () => { await api.patchInvite(editScope.id, { collections: editScope.scope === 'all' ? 'all' : editScope.collections }); setEditScope(null); reload(); toast('已更新权限，对方刷新后生效') }}>保存</button></div>
          </div>
        </div>
      )}
      {detail && (
        <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="modal glass-strong" style={{ width: 560 }}>
            <div className="modal-head"><h2>访问记录</h2><button className="btn sm ghost" onClick={() => setDetail(null)}>关闭</button></div>
            <span className="label">设备 · {detail.sessions.length}</span>
            <table className="list"><tbody>{detail.sessions.map((s) => <tr key={s.device_id}><td className="tiny">{(s.ua || '').replace(/Mozilla\/5\.0 /, '').slice(0, 60)}</td><td className="tiny">{new Date(s.last_seen_at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</td></tr>)}</tbody></table>
            <span className="label" style={{ marginTop: 16 }}>动作 · 最近 50</span>
            <table className="list"><tbody>{detail.log.map((l, i) => <tr key={i}><td>{l.action === 'enter' ? '登录' : l.action === 'contrib' ? '投稿' : l.action}</td><td className="tiny">{new Date(l.at).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
    </div>
  )
}

interface LuneJson { app: string; prompts: { id: string; text: string; title?: string; params?: string; note?: string; tags: string[]; imageIds: string[]; pCodes: string[]; pStages?: Record<string, string>; folderId: string | null; createdAt?: number }[]; pcodes: { id: string; name: string; stages: { id: string; code: string }[]; isPrivate?: boolean }[]; folders: { id: string; name: string }[]; images: { id: string; data?: string; type: string; file?: string }[] }
function Import() {
  const { toast } = useStore()
  const [file, setFile] = useState<File | null>(null)
  const [peek, setPeek] = useState<LuneJson | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [withP, setWithP] = useState(false)
  const [publish, setPublish] = useState(true)
  const load = async (f: File) => { setFile(f); try { const j = JSON.parse(await f.text()) as LuneJson; if (j.app !== 'lune') throw new Error('不是 LUNE 文件'); setPeek(j) } catch (e) { toast((e as Error).message); setPeek(null) } }
  const run = async () => {
    if (!peek) return
    setBusy('准备…')
    try {
      const colMap = new Map<string, string>()
      const existing = (await api.prompts()).collections
      for (const f of peek.folders) { const hit = existing.find((c) => c.name === f.name); if (hit) colMap.set(f.id, hit.id); else { const r = await api.collection({ name: f.name }); if (r.id) colMap.set(f.id, r.id) } }
      let n = 0
      for (const p of peek.prompts) {
        n++; setBusy(`导入 ${n} / ${peek.prompts.length}`)
        const ids: string[] = []
        // an image row belongs to exactly one prompt here, so a shared LUNE image is uploaded once per prompt
        for (const imId of [...new Set(p.imageIds)]) {
          const im = peek.images.find((x) => x.id === imId)
          if (!im?.data) continue
          const bin = atob(im.data); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
          const { blob, width, height } = await reencode(new Blob([u8], { type: im.type }))
          const up = await api.uploadImage(blob, width, height); ids.push(up.id)
        }
        const pl = p.pCodes.map((id) => { const c = peek.pcodes.find((x) => x.id === id); if (!c) return null; const st = p.pStages?.[id] ? c.stages.find((s) => s.id === p.pStages![id]) : null; return { name: c.name, code: (st ?? c.stages[c.stages.length - 1]).code } }).filter((x): x is { name: string; code: string } => !!x)
        await api.createPrompt({ title: p.title, text: p.text, params: p.params, note: p.note, tags: p.tags, imageIds: ids, p: pl, showP: withP && pl.length > 0, published: publish, collectionId: p.folderId ? colMap.get(p.folderId) ?? null : null, createdAt: p.createdAt })
      }
      toast(`已导入 ${peek.prompts.length} 条`, 6000); setPeek(null); setFile(null)
    } catch (e) { toast('导入失败：' + (e as Error).message, 8000) } finally { setBusy(null) }
  }
  return (
    <div className="stack">
      <div className="head"><span className="eyebrow">admin · import</span><h1>从 LUNE 导入</h1></div>
      <div className="card glass">
        <div className="drop" onClick={() => document.getElementById('impf')?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f) }}>
          {file ? `${file.name} · ${peek ? `${peek.prompts.length} 条 prompt · ${peek.images.length} 张图` : '读取中…'}` : '把 LUNE 导出的 .lune.json（或完整备份 .json）拖进来'}
          <input id="impf" type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />
        </div>
        <label className="row"><input type="checkbox" className="switch" checked={withP} onChange={(e) => setWithP(e.target.checked)} /><span>公开这些 prompt 里的 P 值（默认不公开，但 P 值会保存，之后可单条打开）</span></label>
        <label className="row"><input type="checkbox" className="switch" checked={publish} onChange={(e) => setPublish(e.target.checked)} /><span>导入后直接发布</span></label>
        <div className="row"><button className="btn primary" disabled={!peek || !!busy} onClick={run}>{busy ?? '开始导入'}</button><span className="tiny">图片会在浏览器里重新编码到 1600px 再上传，文件夹会变成集合</span></div>
      </div>
    </div>
  )
}

function Usage() {
  const [u, setU] = useState<Awaited<ReturnType<typeof api.usage>> | null>(null)
  useEffect(() => { api.usage().then(setU) }, [])
  const rows = useMemo(() => u ? [['Prompt', String(u.prompts)], ['图片', `${u.images} 张 · ${fmtBytes(u.imageBytes)}${u.kvLimitBytes ? ` / ${fmtBytes(u.kvLimitBytes)} (KV)` : ' (R2)'}`], ['邀请码', `${u.activeInvites} 有效 / ${u.invites} 总`], ['7 天内活跃设备', String(u.activeSessions7d)], ['图片存储', u.storage.toUpperCase()]] : [], [u])
  return (
    <div className="stack">
      <div className="head"><span className="eyebrow">admin · usage</span><h1>用量</h1></div>
      <div className="card glass">{rows.map(([k, v]) => <div key={k} className="row" style={{ justifyContent: 'space-between' }}><span>{k}</span><span className="mono">{v}</span></div>)}{!u && <p className="tiny">读取中…</p>}</div>
      <p className="tiny" style={{ textAlign: 'center' }}>built with LUNE Share</p>
    </div>
  )
}
