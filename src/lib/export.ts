/**
 * One-click export of what the viewer can see: a LUNE-importable `.lune.json` or a Word document.
 * Everything is built in the browser from the prompts already loaded + the image endpoint, so the
 * export can never contain more than the API would show this person (hidden --p stays hidden).
 */
import type { Prompt, Collection } from './api'

export type ExportFormat = 'lune' | 'docx'
export type Progress = (done: number, total: number, what: string) => void

/** only P values their owner made public go into a file */
const pub = (p: Prompt) => (p.showP ? p.p : [])
const titleOf = (p: Prompt) => p.title?.trim() || p.text.trim().split(/\s+/).slice(0, 6).join(' ') || 'untitled'
export const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'prompts'

async function fetchBlob(url: string): Promise<Blob | null> {
  try { const r = await fetch(url, { credentials: 'same-origin' }); return r.ok ? await r.blob() : null } catch { return null }
}
async function blobToBase64(blob: Blob): Promise<string> {
  const u8 = new Uint8Array(await blob.arrayBuffer()); let bin = ''; const CH = 0x8000
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH) as unknown as number[])
  return btoa(bin)
}

/** LUNE export manifest v3 (same shape LUNE's own "导出" writes, so LUNE imports it as-is). */
export async function buildLuneJson(prompts: Prompt[], collections: Collection[], name: string, onProgress?: Progress): Promise<Blob> {
  const t = Date.now()
  const usedCols = new Set(prompts.map((p) => p.collectionId).filter(Boolean))
  const folders = collections.filter((c) => usedCols.has(c.id)).map((c, i) => ({ id: c.id, name: c.name, order: i, createdAt: t }))
  // one PCode per distinct code; the id is derived from the code so importing twice updates instead of duplicating
  const pmap = new Map<string, { id: string; name: string; code: string }>()
  for (const p of prompts) for (const x of pub(p)) if (!pmap.has(x.code)) pmap.set(x.code, { id: 'share-' + x.code.replace(/[^a-z0-9]/gi, '').slice(0, 24), name: x.name || x.code, code: x.code })
  const pcodes = [...pmap.values()].map((c) => ({ id: c.id, code: c.code, name: c.name, isPrivate: false, tags: [], imageIds: [], favorite: false, createdAt: t, updatedAt: t, stages: [{ id: c.id + '-s1', code: c.code, label: '初始', createdAt: t }] }))
  const outPrompts = prompts.map((p) => ({
    id: p.id, text: p.text, title: p.title ?? undefined, note: p.note ?? undefined, params: p.params ?? undefined, tags: p.tags,
    folderId: p.collectionId && usedCols.has(p.collectionId) ? p.collectionId : null,
    pCodes: pub(p).map((x) => pmap.get(x.code)!.id), imageIds: p.images.map((i) => i.id), favorite: false, createdAt: p.createdAt, updatedAt: p.updatedAt,
  }))
  const head = { app: 'lune', kind: 'export', version: 3, exportedAt: t, name, pMode: 'public', folders, pcodes, prompts: outPrompts }
  // images are appended piece by piece so a big pack never needs one giant string in memory
  const parts: BlobPart[] = [JSON.stringify(head).slice(0, -1), ',"images":[']
  const all = prompts.flatMap((p) => p.images); let n = 0, first = true
  for (const im of all) {
    onProgress?.(++n, all.length, '图片')
    const blob = await fetchBlob(im.url); if (!blob) continue
    parts.push((first ? '' : ',') + JSON.stringify({ id: im.id, data: await blobToBase64(blob), type: blob.type || 'image/webp', width: im.width, height: im.height, createdAt: t })); first = false
  }
  parts.push(']}')
  return new Blob(parts, { type: 'application/json' })
}

/** Word: previews on phones, text stays selectable. Mirrors LUNE's docx layout. */
export async function buildDocx(prompts: Prompt[], name: string, onProgress?: Progress): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, ShadingType, BorderStyle } = await import('docx')
  const INK = '2F2733', SOFT = '6E5F6A', FAINT = '9A8791', PINK = 'D98CA8', MAX_W = 460
  const children: InstanceType<typeof Paragraph>[] = []
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: 'LUNE', font: 'Cormorant Garamond', size: 22, color: INK, characterSpacing: 200 })] }))
  children.push(new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: name, font: 'Cormorant Garamond', size: 64, color: INK, italics: true })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun({ text: `${prompts.length} prompts · ${new Date().toLocaleDateString('zh-CN')}`, size: 18, color: FAINT, characterSpacing: 60 })] }))
  let n = 0
  for (const p of prompts) {
    onProgress?.(++n, prompts.length, 'prompt')
    for (const im of p.images.slice(0, 3)) {
      try {
        const blob = await fetchBlob(im.url); if (!blob) continue
        // Word can't show webp: draw to canvas and hand it a jpeg
        const bmp = await createImageBitmap(blob); const w = bmp.width, h = bmp.height
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close()
        const jpg: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.88))
        const scale = Math.min(1, MAX_W / (w * 0.75))
        children.push(new Paragraph({ spacing: { after: 120 }, children: [new ImageRun({ type: 'jpg', data: new Uint8Array(await jpg.arrayBuffer()), transformation: { width: Math.round(w * 0.75 * scale), height: Math.round(h * 0.75 * scale) }, altText: { title: titleOf(p), description: titleOf(p), name: 'image' } })] }))
      } catch { /* skip a broken image */ }
    }
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 80, after: 80 }, children: [new TextRun({ text: titleOf(p), font: 'Cormorant Garamond', size: 30, color: INK })] }))
    children.push(new Paragraph({ spacing: { after: 120 }, shading: { type: ShadingType.CLEAR, fill: 'F5EEF2', color: 'auto' }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: PINK, space: 6 } }, children: [new TextRun({ text: p.text + (p.params ? ' ' + p.params : ''), font: 'Menlo', size: 19, color: INK })] }))
    const meta = [...p.tags.map((t) => '#' + t), ...pub(p).map((x) => `${x.name !== x.code ? x.name + ' ' : ''}(--p ${x.code})`), ...(p.author ? ['by ' + p.author] : [])]
    if (meta.length) children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: meta.join('   '), size: 17, color: SOFT })] }))
    if (p.note) children.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: p.note, size: 18, color: SOFT, italics: true })] }))
    children.push(new Paragraph({ spacing: { after: 360 }, children: [] }))
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 400 }, children: [new TextRun({ text: 'exported from LUNE', font: 'Cormorant Garamond', size: 20, color: FAINT, italics: true })] }))
  const doc = new Document({ creator: 'LUNE', title: name, styles: { default: { document: { run: { font: 'PingFang SC', size: 20, color: INK } } } }, sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }] })
  return Packer.toBlob(doc)
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000)
}
