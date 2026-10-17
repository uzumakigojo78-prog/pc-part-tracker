// Generates public/icons/{192,512}.png (a "chip" glyph) with no dependencies. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = b => { let c = ~0; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }

function png(size) {
  const BG = [36, 86, 214], FG = [255, 255, 255]
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const u = size / 24 // design on a 24-unit grid
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const gx = x / u, gy = y / u
      const inBody = gx >= 6 && gx <= 18 && gy >= 6 && gy <= 18
      const inCore = gx >= 9.5 && gx <= 14.5 && gy >= 9.5 && gy <= 14.5
      let fg = inBody && !inCore
      for (const p of [8.5, 11.5, 14.5]) { // pins on all four sides
        const w = (v) => v >= p - 0.6 && v <= p + 0.6
        if ((w(gx) && (gy >= 3.5 && gy < 6 || gy > 18 && gy <= 20.5)) || (w(gy) && (gx >= 3.5 && gx < 6 || gx > 18 && gx <= 20.5))) fg = true
      }
      const c = fg ? FG : BG
      const i = y * (size * 4 + 1) + 1 + x * 4
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
for (const s of [192, 512]) writeFileSync(new URL(`../public/icons/${s}.png`, import.meta.url), png(s))
