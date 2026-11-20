import { Tile, tileAt, type Grid } from '../grid'
import { PAL } from './palette'

/** Width and height of one tile in canvas pixels (GUI-PLAN §6.1). */
export const TILE = 16

/** The part of a canvas 2D context the tile painters use. */
export type Pen = Pick<CanvasRenderingContext2D, 'fillStyle' | 'fillRect'>

/** Paints the empty floor tile at (x, y), with shadows from walls above and to the left. */
export function drawFloor(pen: Pen, grid: Grid, x: number, y: number): void {
  const px = x * TILE
  const py = y * TILE

  pen.fillStyle = (x + y) % 2 === 1 ? PAL.floor.dark : PAL.floor.light
  pen.fillRect(px, py, TILE, TILE)

  if (y > 0 && tileAt(grid, x, y - 1) !== Tile.Empty) {
    pen.fillStyle = PAL.floor.shadowTop
    pen.fillRect(px, py, TILE, 2)
  }
  if (x > 0 && tileAt(grid, x - 1, y) !== Tile.Empty) {
    pen.fillStyle = PAL.floor.shadowLeft
    pen.fillRect(px, py, 2, TILE)
  }
}

/** One filled rectangle of a tile picture, in pixels from the tile's top-left corner. */
interface Part {
  color: string
  x: number
  y: number
  w: number
  h: number
}

/** Paints every part of a tile picture at tile (x, y), in order. */
function paintParts(pen: Pen, parts: readonly Part[], x: number, y: number): void {
  const px = x * TILE
  const py = y * TILE
  for (const p of parts) {
    pen.fillStyle = p.color
    pen.fillRect(px + p.x, py + p.y, p.w, p.h)
  }
}

/** A hard wall block: dark base, lit face, top highlight, left side and four rivets. */
const HARD_PARTS: readonly Part[] = [
  { color: PAL.hard.bottom, x: 0, y: 0, w: 16, h: 16 },
  { color: PAL.hard.face, x: 0, y: 0, w: 16, h: 13 },
  { color: PAL.hard.highlight, x: 0, y: 0, w: 16, h: 2 },
  { color: PAL.hard.side, x: 0, y: 2, w: 2, h: 11 },
  { color: PAL.hard.highlight, x: 4, y: 4, w: 2, h: 2 },
  { color: PAL.hard.highlight, x: 10, y: 4, w: 2, h: 2 },
  { color: PAL.hard.bottom, x: 4, y: 9, w: 2, h: 2 },
  { color: PAL.hard.bottom, x: 10, y: 9, w: 2, h: 2 },
]

/** Bricks of a soft wall as [x, y, w]; every brick is 4 px high with 1 px mortar around it. */
const BRICKS = [
  [1, 1, 7],
  [9, 1, 7],
  [0, 6, 4],
  [5, 6, 7],
  [13, 6, 3],
  [1, 11, 7],
  [9, 11, 7],
] as const

/** A soft wall: mortar base, then each brick with a highlight on top and a dark bottom edge. */
const SOFT_PARTS: readonly Part[] = [
  { color: PAL.soft.mortar, x: 0, y: 0, w: 16, h: 16 },
  ...BRICKS.flatMap(([x, y, w]) => [
    { color: PAL.soft.brick, x, y, w, h: 4 },
    { color: PAL.soft.highlight, x, y, w, h: 1 },
    { color: PAL.soft.bottom, x, y: y + 3, w, h: 1 },
  ]),
]

/** Paints a hard wall at (x, y). */
export function drawHard(pen: Pen, x: number, y: number): void {
  paintParts(pen, HARD_PARTS, x, y)
}

/** Paints a soft (brick) wall at (x, y). */
export function drawSoft(pen: Pen, x: number, y: number): void {
  paintParts(pen, SOFT_PARTS, x, y)
}
