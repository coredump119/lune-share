/**
 * Read the prompt Midjourney embeds in downloaded images.
 * PNG: tEXt / iTXt / zTXt chunks (keyword "Description", or XMP with dc:description).
 * JPEG / WebP: scan the head of the file for XMP dc:description or an ImageDescription attribute.
 * Filenames are truncated by MJ, so metadata is the only place the full prompt lives.
 */
export interface ExtractedPrompt { text: string; params: string; pCodes: string[]; source: 'metadata' | 'filename' }

const HEAD = 1024 * 1024 // metadata sits at the start; 1 MB is plenty

const latin1 = (u8: Uint8Array) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s }
const utf8 = (u8: Uint8Array) => new TextDecoder('utf-8').decode(u8)

async function inflate(u8: Uint8Array): Promise<string | null> {
  try {
    if (typeof DecompressionStream === 'undefined') return null
    const ds = new DecompressionStream('deflate')
    const stream = new Blob([u8 as BlobPart]).stream().pipeThrough(ds)
    return utf8(new Uint8Array(await new Response(stream).arrayBuffer()))
  } catch { return null }
}

async function pngTexts(u8: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const sig = [137, 80, 78, 71, 13, 10, 26, 10]
  if (u8.length < 8 || sig.some((b, i) => u8[i] !== b)) return out
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  let p = 8
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p); const type = latin1(u8.subarray(p + 4, p + 8))
    const start = p + 8, end = start + len
    if (end > u8.length) break
    const body = u8.subarray(start, end)
    if (type === 'tEXt') {
      const z = body.indexOf(0)
      if (z > 0) out[latin1(body.subarray(0, z))] = latin1(body.subarray(z + 1))
    } else if (type === 'iTXt') {
      const z = body.indexOf(0)
      if (z > 0) {
        const key = latin1(body.subarray(0, z))
        const compFlag = body[z + 1]
        let q = z + 3
        const z2 = body.indexOf(0, q); q = z2 + 1
        const z3 = body.indexOf(0, q); q = z3 + 1
        const data = body.subarray(q)
        out[key] = compFlag === 1 ? (await inflate(data)) ?? '' : utf8(data)
      }
    } else if (type === 'zTXt') {
      const z = body.indexOf(0)
      if (z > 0) out[latin1(body.subarray(0, z))] = (await inflate(body.subarray(z + 2))) ?? ''
    } else if (type === 'IDAT' || type === 'IEND') break
    p = end + 4
  }
  return out
}

const unxml = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').trim()

function fromXmp(xml: string): string | null {
  const m = xml.match(/<dc:description>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/) || xml.match(/dc:description="([^"]*)"/) || xml.match(/<exif:ImageDescription>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/) || xml.match(/exif:ImageDescription="([^"]*)"/)
  return m ? unxml(m[1]) : null
}

/** "prompt words --ar 16:9 --p abc --v 7 Job ID: …" → parts */
export function splitDescription(desc: string): { text: string; params: string; pCodes: string[] } {
  let s = desc.replace(/\s*Job ID:\s*[0-9a-f-]{20,}\s*/i, ' ').replace(/\s+/g, ' ').trim()
  const i = s.search(/\s--[a-z]/i)
  let text = i >= 0 ? s.slice(0, i).trim() : s
  let params = i >= 0 ? s.slice(i).trim() : ''
  const pCodes: string[] = []
  // --p / --profile / --personalize followed by one or more codes (until the next --flag)
  params = params.replace(/--(?:profile|personalize|p)(?![a-z])\s+([^-\s][^\s]*(?:\s+(?!--)[^\s]+)*)/gi, (_, codes: string) => { pCodes.push(...codes.split(/[\s,]+/).filter(Boolean)); return '' })
  params = params.replace(/--(?:profile|personalize|p)(?![a-z])(?=\s|$)/gi, '').replace(/\s+/g, ' ').trim()
  // MJ sometimes prefixes an image-prompt URL; drop leading URLs
  text = text.replace(/^(?:https?:\/\/\S+\s*)+/i, '').trim()
  return { text, params, pCodes }
}

export async function readImagePrompt(file: File): Promise<ExtractedPrompt | null> {
  try {
    const u8 = new Uint8Array(await file.slice(0, HEAD).arrayBuffer())
    let desc: string | null = null
    if (file.type === 'image/png' || /\.png$/i.test(file.name)) {
      const texts = await pngTexts(u8)
      desc = texts['Description'] || texts['description'] || texts['parameters'] || texts['prompt'] || null
      if (!desc && texts['XML:com.adobe.xmp']) desc = fromXmp(texts['XML:com.adobe.xmp'])
    }
    if (!desc) {
      const head = latin1(u8)
      const x = head.indexOf('<x:xmpmeta')
      if (x >= 0) desc = fromXmp(head.slice(x, head.indexOf('</x:xmpmeta>', x) + 12))
    }
    if (desc && desc.trim().length > 3) {
      const parts = splitDescription(desc)
      if (parts.text.length > 3) return { ...parts, source: 'metadata' }
    }
  } catch { /* fall through */ }
  const fn = promptFromFilename(file.name)
  return fn ? { text: fn, params: '', pCodes: [], source: 'filename' } : null
}

/** `user_a_pink_desert_under_a_pale_moon_1a2b3c4d-....png` → "a pink desert under a pale moon" (MJ truncates long prompts here) */
export function promptFromFilename(name: string): string {
  let n = name.replace(/\.[a-z0-9]+$/i, '')
  n = n.replace(/_?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_\d+)?$/i, '')
  const parts = n.split('_')
  if (parts.length < 4) return ''
  parts.shift()
  const s = parts.join(' ').replace(/\s+/g, ' ').trim()
  return s.length > 8 ? s : ''
}

export async function readFirstPrompt(files: File[]): Promise<ExtractedPrompt | null> {
  let best: ExtractedPrompt | null = null
  for (const f of files) {
    const r = await readImagePrompt(f)
    if (r?.source === 'metadata') return r
    if (r && !best) best = r
  }
  return best
}
