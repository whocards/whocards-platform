// QR model 2, byte mode, ECC M, versions 1-9 (ISO/IEC 18004, after Project Nayuki's encoder).

const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22]
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5]
const MAX_VERSION = 9

const gfMul = (x: number, y: number): number => {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

const rsDivisor = (degree: number): number[] => {
  const out: number[] = Array.from({length: degree}, (_, i) => (i === degree - 1 ? 1 : 0))
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < out.length; j++) {
      out[j] = gfMul(out[j] ?? 0, root) ^ (out[j + 1] ?? 0)
    }
    root = gfMul(root, 0x02)
  }
  return out
}

const rsRemainder = (data: readonly number[], divisor: readonly number[]): number[] => {
  const out = divisor.map(() => 0)
  for (const byte of data) {
    const factor = byte ^ (out.shift() ?? 0)
    out.push(0)
    divisor.forEach((coef, i) => {
      out[i] = (out[i] ?? 0) ^ gfMul(coef, factor)
    })
  }
  return out
}

const rawModules = (ver: number): number => {
  let n = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    n -= (25 * align - 10) * align - 55
    if (ver >= 7) n -= 36
  }
  return n
}

const dataCodewords = (ver: number): number =>
  Math.floor(rawModules(ver) / 8) - (ECC_PER_BLOCK[ver] ?? 0) * (BLOCKS[ver] ?? 0)

const alignmentPositions = (ver: number, size: number): number[] => {
  if (ver === 1) return []
  const count = Math.floor(ver / 7) + 2
  const step = Math.ceil((ver * 4 + 4) / (count * 2 - 2)) * 2
  const out = [6]
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos)
  return out
}

const bit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

const encodeData = (bytes: Uint8Array, ver: number): number[] => {
  const bits: number[] = []
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, 8)
  for (const b of bytes) push(b, 8)
  const capacity = dataCodewords(ver) * 8
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8)
  return Array.from({length: bits.length / 8}, (_, i) =>
    bits.slice(i * 8, i * 8 + 8).reduce((acc, b) => (acc << 1) | b, 0)
  )
}

const interleave = (data: readonly number[], ver: number): number[] => {
  const blocks = BLOCKS[ver] ?? 1
  const eccLen = ECC_PER_BLOCK[ver] ?? 0
  const raw = Math.floor(rawModules(ver) / 8)
  const shortBlocks = blocks - (raw % blocks)
  const shortLen = Math.floor(raw / blocks)
  const divisor = rsDivisor(eccLen)
  const all: number[][] = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < shortBlocks) dat.push(0)
    all.push([...dat, ...ecc])
  }
  const out: number[] = []
  for (let i = 0; i < (all[0]?.length ?? 0); i++) {
    all.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= shortBlocks) out.push(block[i] ?? 0)
    })
  }
  return out
}

const finderLike = (line: boolean[]) => {
  const s = line.map((d) => (d ? '1' : '0')).join('')
  return (s.match(/(?=00001011101)|(?=10111010000)/g) ?? []).length
}

const penalty = (m: boolean[][]): number => {
  const size = m.length
  const at = (x: number, y: number) => m[y]?.[x] ?? false
  let score = 0
  for (let axis = 0; axis < 2; axis++) {
    for (let a = 0; a < size; a++) {
      const line = Array.from({length: size}, (_, b) => (axis === 0 ? at(b, a) : at(a, b)))
      let run = 1
      for (let b = 1; b <= size; b++) {
        if (b < size && line[b] === line[b - 1]) run++
        else {
          if (run >= 5) score += run - 2
          run = 1
        }
      }
      const padded = [false, false, false, false, ...line, false, false, false, false]
      score += 40 * finderLike(padded)
    }
  }
  let dark = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (at(x, y)) dark++
      if (x < size - 1 && y < size - 1) {
        const c = at(x, y)
        if (c === at(x + 1, y) && c === at(x, y + 1) && c === at(x + 1, y + 1)) score += 3
      }
    }
  }
  const total = size * size
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
  return score
}

/** Rows of modules, true = dark, without the quiet zone. */
export const qrMatrix = (text: string): boolean[][] => {
  const bytes = new TextEncoder().encode(text)
  let ver = 1
  while (ver <= MAX_VERSION && dataCodewords(ver) < bytes.length + 2) ver++
  if (ver > MAX_VERSION) throw new Error('Text too long for a QR code here')

  const size = ver * 4 + 17
  const modules = Array.from({length: size}, () => Array.from({length: size}, () => false))
  const fixed = Array.from({length: size}, () => Array.from({length: size}, () => false))
  const set = (x: number, y: number, dark: boolean) => {
    const row = modules[y]
    const fixedRow = fixed[y]
    if (!row || !fixedRow || x < 0 || x >= size) return
    row[x] = dark
    fixedRow[x] = true
  }

  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy))
        set(cx + dx, cy + dy, d !== 2 && d !== 4)
      }
    }
  }
  const align = alignmentPositions(ver, size)
  align.forEach((ay, i) => {
    align.forEach((ax, j) => {
      const last = align.length - 1
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++)
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    })
  })

  const drawFormat = (mask: number) => {
    // ECC level M is format bits 00.
    const data = mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i))
    set(8, 7, bit(bits, 6))
    set(8, 8, bit(bits, 7))
    set(7, 8, bit(bits, 8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i))
    set(8, size - 8, true)
  }
  drawFormat(0)

  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, bit(bits, i))
      set(b, a, bit(bits, i))
    }
  }

  const codewords = interleave(encodeData(bytes, ver), ver)
  let k = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert
        const row = modules[y]
        if (row && !fixed[y]?.[x] && k < codewords.length * 8) {
          row[x] = bit(codewords[k >>> 3] ?? 0, 7 - (k & 7))
          k++
        }
      }
    }
  }

  const applyMask = (mask: number) => {
    const fn = MASKS[mask]
    if (!fn) return
    for (let y = 0; y < size; y++) {
      const row = modules[y]
      for (let x = 0; x < size; x++) {
        if (row && !fixed[y]?.[x] && fn(x, y)) row[x] = !row[x]
      }
    }
  }

  let best = 0
  let bestScore = Infinity
  for (let mask = 0; mask < MASKS.length; mask++) {
    applyMask(mask)
    drawFormat(mask)
    const score = penalty(modules)
    if (score < bestScore) {
      best = mask
      bestScore = score
    }
    applyMask(mask)
  }
  applyMask(best)
  drawFormat(best)
  return modules
}

const qrPath = (matrix: readonly boolean[][], quiet: number): string =>
  matrix
    .flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`M${x + quiet} ${y + quiet}h1v1h-1z`] : []))
    )
    .join('')

/** Standalone SVG, black on white with a 4-module quiet zone. */
export const qrSvg = (text: string): string => {
  const quiet = 4
  const matrix = qrMatrix(text)
  const box = matrix.length + quiet * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges"><rect width="${box}" height="${box}" fill="#fff"/><path d="${qrPath(matrix, quiet)}" fill="#000"/></svg>`
}
