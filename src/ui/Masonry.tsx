import { useEffect, useRef, useState, type ReactNode } from 'react'
import './masonry.css'

/**
 * Centered masonry: column count = min(columns that fit, item count), block centered,
 * card width never stretches. Items are dealt round-robin so reading order stays row-wise.
 */
export function Masonry({ items, minWidth = 250, gap = 18 }: { items: ReactNode[]; minWidth?: number; gap?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const fit = Math.max(1, Math.floor((width + gap) / (minWidth + gap)))
  const cols = Math.max(1, Math.min(fit, items.length))
  const colW = width ? (width - gap * (fit - 1)) / fit : minWidth
  const columns: ReactNode[][] = Array.from({ length: cols }, () => [])
  items.forEach((it, i) => columns[i % cols].push(it))
  return (
    <div ref={ref} className="masonry" style={{ gap }}>
      {width > 0 && columns.map((col, i) => (
        <div key={i} className="masonry-col" style={{ width: colW, gap }}>{col}</div>
      ))}
    </div>
  )
}
