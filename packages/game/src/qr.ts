import {encode} from 'uqr'

/** One SVG path for every dark module, so a QR is a single DOM node. */
export const qrPath = (value: string): {size: number; d: string} => {
  const {size, data} = encode(value, {ecc: 'M', border: 2})
  const d = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('')
  return {size, d}
}
