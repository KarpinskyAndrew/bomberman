import { describe, expect, it } from 'vitest'
import { parseGrid } from '../../grid'
import { PAL } from '../palette'
import { drawFloor } from '../tiles'
import { FakePen } from './fakePen'

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
