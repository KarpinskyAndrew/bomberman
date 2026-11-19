import { describe, expect, it } from 'vitest'
import { Tile, parseGrid, tileAt, type Grid } from '../grid'

describe('parseGrid', () => {
  it('reads a 3x3 map', () => {
    const grid = parseGrid(`
            ###
            #+.
            ###
            `)
    expect(grid.size).toBe(3)
    expect(tileAt(grid, 0, 0)).toBe(Tile.HardWall)
    expect(tileAt(grid, 1, 1)).toBe(Tile.SoftWall)
    expect(tileAt(grid, 2, 1)).toBe(Tile.Empty)
  })

  it('stores the tiles row by row', () => {
    const grid = parseGrid(`
            ###
            #+.
            ###
            `)
    expect(grid.size).toBe(3)
    expect(grid.tiles).toEqual([
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
      Tile.SoftWall,
      Tile.Empty,
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
    ])
  })

  it('rejects a map that is not square', () => {
    expect(() =>
      parseGrid(`
            ##
            #+
            ##
            `),
    ).toThrow(/square/)
  })

  it('rejects an unknown tile', () => {
    expect(() =>
      parseGrid(`
            #X#
            #+.
            ###
            `),
    ).toThrow(/unknown character/)
  })

  it('rejects an empty map', () => {
    expect(() => parseGrid(`       `)).toThrow(/empty map/)
  })
})

describe('tileAt', () => {
  // .#   row y=0: index 0, 1
  // +.   row y=1: index 2, 3
  const grid: Grid = {
    size: 2,
    tiles: [Tile.Empty, Tile.HardWall, Tile.SoftWall, Tile.Empty],
  }

  it('reads the tile at (x, y)', () => {
    expect(tileAt(grid, 1, 0)).toBe(Tile.HardWall)
    expect(tileAt(grid, 0, 1)).toBe(Tile.SoftWall)
  })

  it('rejects x past the right edge instead of reading the next row', () => {
    expect(() => tileAt(grid, 2, 0)).toThrow(/out of range/)
  })

  it('rejects y past the bottom edge', () => {
    expect(() => tileAt(grid, 0, 2)).toThrow(/out of range/)
  })

  it('rejects negative coordinates', () => {
    expect(() => tileAt(grid, -1, 0)).toThrow(/out of range/)
    expect(() => tileAt(grid, 0, -1)).toThrow(/out of range/)
  })
})
