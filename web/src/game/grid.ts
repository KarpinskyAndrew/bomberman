/** Tile kinds, same numbers as the Go Tile constants. */
export const Tile = {
  Empty: 0,
  HardWall: 1,
  SoftWall: 2,
} as const

/** The type of one tile: 0 | 1 | 2. */
export type Tile = (typeof Tile)[keyof typeof Tile]

/** A square map. tiles is row-major: the tile at (x, y) is tiles[y * size + x]. */
export interface Grid {
  size: number
  tiles: Tile[]
}

/** Returns the tile at (x, y). */
export function tileAt(grid: Grid, x: number, y: number): Tile {
  const outOfRangeError = 'out of range'
  if (x < 0 || y < 0) throw new Error(outOfRangeError)
  if (x >= grid.size || y >= grid.size) throw new Error(outOfRangeError)

  const tile = grid.tiles[y * grid.size + x]

  if (tile === undefined) {
    throw new Error(outOfRangeError)
  }
  return tile
}

function parseTile(c: string): Tile {
  switch (c) {
    case '#':
      return Tile.HardWall
    case '+':
      return Tile.SoftWall
    case '.':
      return Tile.Empty
    default:
      throw new Error(`parseGrid: unknown character '${c}'`)
  }
}

 /** Builds a Grid from a text map: '#' hard wall, '+' soft wall, '.' empty. Throws on a bad map. */
export function parseGrid(text: string): Grid {
  const trimmedText = text.trim()
  if (trimmedText === '') {
    throw new Error('parseGrid: It is an empty map')
  }
  const lines = trimmedText.split('\n')
  const size = lines.length
  const tiles: Tile[] = []

  lines.forEach((line, y) => {
    const trimmedLine = line.trim()
    if (trimmedLine.length !== size) {
      throw new Error(
        `parseGrid: row ${y} has ${trimmedLine.length} tiles, want ${size} (map is not square)`,
      )
    }
    for (const c of trimmedLine) {
      tiles.push(parseTile(c))
    }
  })

  return { size, tiles }
}
