import type { Grid } from './grid'
import { drawGrid, TILE, type Pen } from './renderer/tiles'

/** The game engine: draws the arena on a canvas. Plain TypeScript, no Vue. */
export class GameClient {  
  private readonly grid: Grid
  private readonly pen: Pen

  constructor(canvas: HTMLCanvasElement, grid: Grid) {    
    this.grid = grid

    canvas.width = grid.size * TILE
    canvas.height = grid.size * TILE

    const pen = canvas.getContext('2d')

    if (pen === null) {
      throw new Error('The canvas has no 2D context')
    }

    this.pen = pen
  }

  /** Paints the whole arena once. */
  draw(): void {
    drawGrid(this.pen, this.grid)
  }
}
