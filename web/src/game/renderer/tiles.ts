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
