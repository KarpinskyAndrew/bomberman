import { describe, expect, it } from 'vitest'
import { parseGrid } from '../../grid'
import { PAL } from '../palette'
import { TILE, drawFloor, drawGrid, drawHard, drawSoft, type Pen } from '../tiles'
import { FakePen, type Rect } from './fakePen'

/** Paints one tile with draw at (x, y) and returns the recorded rects. */
function paint(draw: (pen: Pen, x: number, y: number) => void, x: number, y: number): Rect[] {
  const pen = new FakePen()
  draw(pen, x, y)
  return pen.rects
}

/** True if the rect lies inside the tile whose top-left pixel is (px, py). */
function insideTile(r: Rect, px: number, py: number): boolean {
  return r.x >= px && r.y >= py && r.x + r.w <= px + TILE && r.y + r.h <= py + TILE
}

/** The same rects, moved by (dx, dy) pixels. */
function moved(rects: Rect[], dx: number, dy: number): Rect[] {
  return rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }))
}

/** Only the position and size of a rect, without its colour. */
function box(r: Rect) {
  return { x: r.x, y: r.y, w: r.w, h: r.h }
}

describe('drawFloor', () => {
  it('paints a plain floor tile when no wall is above or to the left', () => {
    // 1. Arrange: a map and a pen that records what it paints.
    const grid = parseGrid(`
      ...
      ...
      ...
    `)
    const pen = new FakePen()

    // 2. Act: paint one tile.
    drawFloor(pen, grid, 1, 1)

    // 3. Assert: check the rectangles the pen recorded.
    //    (1 + 1) is even, so the shade is light. Tile (1, 1) starts at pixel (16, 16).
    expect(pen.rects).toEqual([{ color: PAL.floor.light, x: 16, y: 16, w: 16, h: 16 }])
  })

  it('alternates the floor colour like a checkerboard', () => {
    const grid = parseGrid(`
      ...
      ...
      ...
    `)
    const pen = new FakePen()

    drawFloor(pen, grid, 2, 1)

    // (2 + 1) is odd, so the shade is dark. Tile (2, 1) starts at pixel (32, 16).
    expect(pen.rects).toEqual([{ color: PAL.floor.dark, x: 32, y: 16, w: 16, h: 16 }])
  })

  it('adds a top shadow under a wall', () => {
    const grid = parseGrid(`
      .#.
      ...
      ...
    `)
    const pen = new FakePen()

    drawFloor(pen, grid, 1, 1)

    expect(pen.rects).toEqual([
      { color: PAL.floor.light, x: 16, y: 16, w: 16, h: 16 },
      { color: PAL.floor.shadowTop, x: 16, y: 16, w: 16, h: 2 },
    ])
  })

  it('adds a left shadow next to a soft wall', () => {
    const grid = parseGrid(`
      ...
      +..
      ...
    `)
    const pen = new FakePen()

    drawFloor(pen, grid, 1, 1)

    expect(pen.rects).toEqual([
      { color: PAL.floor.light, x: 16, y: 16, w: 16, h: 16 },
      { color: PAL.floor.shadowLeft, x: 16, y: 16, w: 2, h: 16 },
    ])
  })

  it('paints the base, then the top shadow, then the left shadow', () => {
    const grid = parseGrid(`
      .#.
      #..
      ...
    `)
    const pen = new FakePen()

    drawFloor(pen, grid, 1, 1)

    expect(pen.rects).toEqual([
      { color: PAL.floor.light, x: 16, y: 16, w: 16, h: 16 },
      { color: PAL.floor.shadowTop, x: 16, y: 16, w: 16, h: 2 },
      { color: PAL.floor.shadowLeft, x: 16, y: 16, w: 2, h: 16 },
    ])
  })

  it('does not look outside the map at the top-left corner', () => {
    const grid = parseGrid(`
      ...
      ...
      ...
    `)
    const pen = new FakePen()

    drawFloor(pen, grid, 0, 0)

    // Nothing is above or to the left of (0, 0), so only the base rect.
    expect(pen.rects).toEqual([{ color: PAL.floor.light, x: 0, y: 0, w: 16, h: 16 }])
  })
})

describe('drawHard', () => {
  it('starts with a full-tile base in the bottom shade', () => {
    const rects = paint(drawHard, 1, 1)

    expect(rects[0]).toEqual({ color: PAL.hard.bottom, x: 16, y: 16, w: 16, h: 16 })
  })

  it('adds detail on top of the base', () => {
    expect(paint(drawHard, 1, 1).length).toBeGreaterThan(1)
  })

  it('stays inside its tile', () => {
    const rects = paint(drawHard, 2, 3)

    expect(rects.filter((r) => !insideTile(r, 32, 48))).toEqual([])
  })

  it('uses only hard wall colours', () => {
    const colors = paint(drawHard, 1, 1).map((r) => r.color)
    const allowed: string[] = Object.values(PAL.hard)

    expect(colors.filter((c) => !allowed.includes(c))).toEqual([])
  })

  it('draws the same picture on every tile, only moved', () => {
    expect(paint(drawHard, 2, 3)).toEqual(moved(paint(drawHard, 0, 0), 32, 48))
  })
})

describe('drawSoft', () => {
  it('starts with a full-tile base in the mortar colour', () => {
    const rects = paint(drawSoft, 1, 1)

    expect(rects[0]).toEqual({ color: PAL.soft.mortar, x: 16, y: 16, w: 16, h: 16 })
  })

  it('lays 7 bricks in 3 rows, the middle row shifted by half a brick', () => {
    const bricks = paint(drawSoft, 0, 0)
      .filter((r) => r.color === PAL.soft.brick)
      .map(box)

    // A 1 px mortar line between all bricks:
    //   row 0:  .#######.#######
    //   row 1:  ####.#######.###
    //   row 2:  .#######.#######
    expect(bricks).toEqual([
      { x: 1, y: 1, w: 7, h: 4 },
      { x: 9, y: 1, w: 7, h: 4 },
      { x: 0, y: 6, w: 4, h: 4 },
      { x: 5, y: 6, w: 7, h: 4 },
      { x: 13, y: 6, w: 3, h: 4 },
      { x: 1, y: 11, w: 7, h: 4 },
      { x: 9, y: 11, w: 7, h: 4 },
    ])
  })

  it('gives every brick a 1 px highlight on top and a 1 px dark bottom edge', () => {
    const rects = paint(drawSoft, 0, 0)
    const bricks = rects.filter((r) => r.color === PAL.soft.brick)
    const highlights = rects.filter((r) => r.color === PAL.soft.highlight).map(box)
    const bottoms = rects.filter((r) => r.color === PAL.soft.bottom).map(box)

    expect(highlights).toEqual(bricks.map((b) => ({ x: b.x, y: b.y, w: b.w, h: 1 })))
    expect(bottoms).toEqual(bricks.map((b) => ({ x: b.x, y: b.y + b.h - 1, w: b.w, h: 1 })))
  })

  it('stays inside its tile', () => {
    const rects = paint(drawSoft, 2, 3)

    expect(rects.filter((r) => !insideTile(r, 32, 48))).toEqual([])
  })

  it('draws the same picture on every tile, only moved', () => {
    expect(paint(drawSoft, 2, 3)).toEqual(moved(paint(drawSoft, 0, 0), 32, 48))
  })
})

describe('drawGrid', () => {
  it('paints every tile with the painter for its kind, row by row', () => {
    const grid = parseGrid(`
        #+
        ..
        `)
    const pen = new FakePen()

    drawGrid(pen, grid)

    const expected = new FakePen()
    drawHard(expected, 0, 0)
    drawSoft(expected, 1, 0)
    drawFloor(expected, grid, 0, 1)
    drawFloor(expected, grid, 1, 1)

    expect(pen.rects).toEqual(expected.rects)
  })
})
