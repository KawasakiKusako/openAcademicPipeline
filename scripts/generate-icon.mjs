// One-off placeholder icon generator (256x256 PNG, no dependencies).
// Run: node scripts/generate-icon.mjs
// Replace resources/icon.png with a real brand icon later.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 256
const W = SIZE, H = SIZE

// CRC32 (PNG chunks)
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// Raw pixels: dark academic background + light blue center circle (placeholder mark)
const raw = Buffer.alloc(H * (1 + W * 4))
const bg = [15, 23, 42], fg = [96, 165, 250]
const cx = W / 2, cy = H / 2, R = 62
for (let y = 0; y < H; y++) {
  const rowStart = y * (1 + W * 4)
  raw[rowStart] = 0 // filter: none
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy)
    const c = d <= R ? fg : bg
    const o = rowStart + 1 + x * 4
    raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`Wrote ${out} (${png.length} bytes)`)
