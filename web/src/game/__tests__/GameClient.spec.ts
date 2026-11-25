import { describe, expect, it, vi } from 'vitest'
import { GameClient } from '../GameClient'
import { parseGrid } from '../grid'
import { drawGrid } from '../renderer/tiles'
import { FakePen } from '../renderer/__tests__/fakePen'

/** A canvas whose getContext returns a FakePen instead of a real 2D context. */
function canvasWithPen() {
  const canvas = document.createElement('canvas')
  const pen = new FakePen()

  vi.spyOn(canvas, 'getContext').mockReturnValue(pen as unknown as CanvasRenderingContext2D)
  return { canvas, pen }
}

const map = `
  #+.
  ...
  .+#
`

describe('GameClient', () => {
  it('paints the map on the canvas', () => {
    const grid = parseGrid(map)
    const { canvas, pen } = canvasWithPen()
    const client = new GameClient(canvas, grid)

    client.draw()

    const expected = new FakePen()
    drawGrid(expected, grid)

    expect(pen.rects).toEqual(expected.rects)
  })

  it('sizes the canvas to 16px per tile', () => {
    const grid = parseGrid(map)
    const { canvas } = canvasWithPen()
    new GameClient(canvas, grid)

    expect(canvas.width).toBe(48)
    expect(canvas.height).toBe(48)
  })
})
