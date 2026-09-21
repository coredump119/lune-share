import { useState } from 'react'
import type { Prompt, Collection } from '../lib/api'
import { buildDocx, buildLuneJson, download, safeName } from '../lib/export'

/** Exports exactly the list the caller passes in (the current filter), nothing the viewer can't already see. */
export function ExportModal({ prompts, collections, name, onClose, toast }: { prompts: Prompt[]; collections: Collection[]; name: string; onClose: () => void; toast: (t: string, ms?: number) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const images = prompts.reduce((n, p) => n + p.images.length, 0)
  const run = async (fmt: 'lune' | 'docx') => {
    try {
      setBusy('准备中…')
      const onP = (d: number, t: number, what: string) => setBusy(`${what} ${d} / ${t}`)
      const blob = fmt === 'lune' ? await buildLuneJson(prompts, collections, name, onP) : await buildDocx(prompts, name, onP)
      download(blob, `${safeName(name)}.${fmt === 'lune' ? 'lune.json' : 'docx'}`)
      toast(fmt === 'lune' ? '已导出，在 LUNE 的设置里导入即可' : '已导出 Word 文档'); onClose()
    } catch (e) { toast('导出失败：' + (e as Error).message, 8000) } finally { setBusy(null) }
  }
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <div className="modal glass-strong" style={{ width: 460 }}>
        <div className="modal-head"><h2>导出「{name}」</h2></div>
        <p className="tiny" style={{ margin: '4px 0 14px' }}>当前筛选下的 {prompts.length} 条 prompt、{images} 张图。只包含你现在能看到的内容，没公开的 --p 不会出现在文件里。</p>
        <div className="stack" style={{ gap: 8 }}>
          <button className="btn primary" disabled={!!busy || !prompts.length} style={{ width: '100%', justifyContent: 'center' }} onClick={() => run('lune')}>.lune.json · 可导入 LUNE</button>
          <button className="btn" disabled={!!busy || !prompts.length} style={{ width: '100%', justifyContent: 'center' }} onClick={() => run('docx')}>Word 文档 · 手机可预览、文字可复制</button>
          <button className="btn ghost" disabled={!!busy} style={{ width: '100%', justifyContent: 'center' }} onClick={onClose}>取消</button>
        </div>
        {busy && <p className="tiny" style={{ textAlign: 'center', marginTop: 12 }}>{busy}</p>}
      </div>
    </div>
  )
}
