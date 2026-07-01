// Precut business-card sheet registry + layout engine (epic #19, ticket #37).
//
// Worldwide precut sheets collapse to ~6 distinct *physical layouts* (page + card
// size + grid); the ~20 well-known SKUs are aliases of those. This module is pure
// geometry — no rendering deps — so the PDF function (#38) and the calibration sheet
// (#40) both consume it.
//
// Everything is stored in PostScript points (pt, 1/72"), the unit pdf-lib renders in.
// The 10-up sheets tile their cards adjacently and centred on the page (verified for
// Avery 5371: 0.75" side / 0.5" top margins are exactly the centred residual, gutter 0),
// so margins are *derived* by centring the grid rather than hand-copied per SKU — fewer
// magic numbers to get wrong, and the calibration nudge (#40) absorbs any residual.

/** Points per inch / millimetre (1pt = 1/72"). */
export const PT_PER_IN = 72
export const PT_PER_MM = 72 / 25.4

export const inch = (n: number): number => n * PT_PER_IN
export const mm = (n: number): number => n * PT_PER_MM

export type Size = {width: number; height: number}
export type Rect = {x: number; y: number; width: number; height: number}

export type LayoutId =
  | 'us-letter-10up'
  | 'a4-85x54-10up'
  | 'a4-85x55-10up'
  | 'a4-90x55-10up'
  | 'a4-91x55-10up'
  | 'us-letter-cleanedge-8up'

export type PhysicalLayout = {
  id: LayoutId
  label: string
  /** Page size in pt (portrait). */
  page: Size
  /** Card size in pt (landscape card face). */
  card: Size
  cols: number
  rows: number
  /** Gap between cards in pt. Adjacent precut sheets are {x:0,y:0}. */
  gutter: {x: number; y: number}
  /** False → UI shows a "coming soon" tile; geometry not yet calibrated. */
  supported: boolean
  /** Short human note (paper, where it's common). */
  note?: string
}

// US Letter = 8.5×11"; A4 = 210×297mm.
const LETTER: Size = {width: inch(8.5), height: inch(11)}
const A4: Size = {width: mm(210), height: mm(297)}

export const PHYSICAL_LAYOUTS: Record<LayoutId, PhysicalLayout> = {
  'us-letter-10up': {
    id: 'us-letter-10up',
    label: 'US Letter · 3.5 × 2 in · 10-up',
    page: LETTER,
    card: {width: inch(3.5), height: inch(2)},
    cols: 2,
    rows: 5,
    gutter: {x: 0, y: 0},
    supported: true,
    note: 'US/Canada (Avery 5371, 8371, 8377, …)',
  },
  'a4-85x54-10up': {
    id: 'a4-85x54-10up',
    label: 'A4 · 85 × 54 mm · 10-up',
    page: A4,
    card: {width: mm(85), height: mm(54)},
    cols: 2,
    rows: 5,
    gutter: {x: 0, y: 0},
    supported: true,
    note: 'Europe (Avery C32011 / L7415, Decadry)',
  },
  'a4-85x55-10up': {
    id: 'a4-85x55-10up',
    label: 'A4 · 85 × 55 mm · 10-up',
    page: A4,
    card: {width: mm(85), height: mm(55)},
    cols: 2,
    rows: 5,
    gutter: {x: 0, y: 0},
    supported: true,
    note: 'Europe (Sigel LP798, Herma)',
  },
  'a4-90x55-10up': {
    id: 'a4-90x55-10up',
    label: 'A4 · 90 × 55 mm · 10-up',
    page: A4,
    card: {width: mm(90), height: mm(55)},
    cols: 2,
    rows: 5,
    gutter: {x: 0, y: 0},
    supported: true,
    note: 'Australia / Scandinavia',
  },
  'a4-91x55-10up': {
    id: 'a4-91x55-10up',
    label: 'A4 · 91 × 55 mm · 10-up (meishi)',
    page: A4,
    card: {width: mm(91), height: mm(55)},
    cols: 2,
    rows: 5,
    gutter: {x: 0, y: 0},
    supported: true,
    note: 'Japan (meishi)',
  },
  'us-letter-cleanedge-8up': {
    id: 'us-letter-cleanedge-8up',
    label: 'US Letter · 3.5 × 2 in clean-edge · 8-up',
    page: LETTER,
    card: {width: inch(3.5), height: inch(2)},
    cols: 2,
    rows: 4,
    // Clean-edge stock has inter-card gaps that vary by SKU; needs a calibration
    // pass before we can trust the perforation positions, so flagged unsupported.
    gutter: {x: 0, y: 0},
    supported: false,
    note: 'Clean-edge (Avery 8859 / 8869) — pending calibration',
  },
}

/** Well-known SKU / product codes → physical layout id. */
export const SKU_ALIASES: Record<string, LayoutId> = {
  // US Letter 10-up
  'avery-5371': 'us-letter-10up',
  'avery-8371': 'us-letter-10up',
  'avery-8377': 'us-letter-10up',
  'avery-28877': 'us-letter-10up',
  'avery-5911': 'us-letter-10up',
  // A4 85×54
  'avery-c32011': 'a4-85x54-10up',
  'avery-l7415': 'a4-85x54-10up',
  'decadry-dlw1721': 'a4-85x54-10up',
  'sigel-lp850': 'a4-85x54-10up',
  // A4 85×55
  'sigel-lp798': 'a4-85x55-10up',
  'herma-4500': 'a4-85x55-10up',
  'avery-c32028': 'a4-85x55-10up',
  // A4 90×55
  'avery-au-90x55': 'a4-90x55-10up',
  'decadry-90x55': 'a4-90x55-10up',
  // A4 91×55 (meishi)
  'jp-meishi-91x55': 'a4-91x55-10up',
  'kokuyo-meishi': 'a4-91x55-10up',
  // US Letter clean-edge 8-up
  'avery-8859': 'us-letter-cleanedge-8up',
  'avery-8869': 'us-letter-cleanedge-8up',
}

export type Layout = {
  layout: PhysicalLayout
  pageSize: Size
  cols: number
  rows: number
  /** Cards per page. */
  perPage: number
  /**
   * Ordered card rectangles for one page, row-major (top-left first). `y` is measured
   * from the *top* of the page; a pdf-lib renderer flips to bottom-origin once.
   */
  cardRects: Rect[]
}

/** Resolve a preset id or a SKU alias to a physical layout, or `undefined`. */
export const resolveLayout = (presetOrAlias: string): PhysicalLayout | undefined => {
  // `Object.hasOwn`, not `in`/bare indexing: these are plain objects, so inherited
  // keys like "constructor" would otherwise resolve to Object.prototype members.
  if (Object.hasOwn(PHYSICAL_LAYOUTS, presetOrAlias))
    return PHYSICAL_LAYOUTS[presetOrAlias as LayoutId]
  const aliased = Object.hasOwn(SKU_ALIASES, presetOrAlias) ? SKU_ALIASES[presetOrAlias] : undefined
  return aliased ? PHYSICAL_LAYOUTS[aliased] : undefined
}

/**
 * Geometry for one page of `presetOrAlias`: page size + exact, ordered card rectangles.
 * The grid is centred on the page with the layout's gutters; pagination over N cards is
 * derived by the caller (`Math.ceil(n / perPage)`), reusing these same rects per page.
 * Returns `undefined` for an unknown preset.
 */
export const layoutFor = (presetOrAlias: string): Layout | undefined => {
  const layout = resolveLayout(presetOrAlias)
  if (!layout) return undefined

  const {page, card, cols, rows, gutter} = layout
  const gridWidth = cols * card.width + (cols - 1) * gutter.x
  const gridHeight = rows * card.height + (rows - 1) * gutter.y
  const marginLeft = (page.width - gridWidth) / 2
  const marginTop = (page.height - gridHeight) / 2

  const cardRects: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cardRects.push({
        x: marginLeft + col * (card.width + gutter.x),
        y: marginTop + row * (card.height + gutter.y),
        width: card.width,
        height: card.height,
      })
    }
  }

  return {layout, pageSize: page, cols, rows, perPage: cols * rows, cardRects}
}
