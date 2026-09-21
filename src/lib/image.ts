/** Re-encode in the browser (drops all metadata, incl. MJ prompt / --p) and cap the long edge. */
const MAX_EDGE = 1600
export async function reencode(file: Blob, maxEdge = MAX_EDGE): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  cv.getContext('2d')!.drawImage(bmp, 0, 0, w, h); bmp.close()
  const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/webp', 0.86))
  return { blob, width: w, height: h }
}
export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const out: File[] = []
  for (const f of Array.from(dt.files ?? [])) if (f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name)) out.push(f)
  return out
}
export const fmtBytes = (b: number) => (b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB')
