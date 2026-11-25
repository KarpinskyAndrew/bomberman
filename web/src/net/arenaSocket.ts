import { Tile, type Grid } from '@/game/grid'

const TILE_VALUES: readonly number[] = Object.values(Tile)

function isTile(value: unknown): value is Tile {
  return typeof value === 'number' && TILE_VALUES.includes(value)
}

/**
 * Checks an arena_state message from the game server and turns it into a Grid.
 */
export function parseArenaState(text: string): Grid {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('arena_state: message is not JSON')
  }

  if (typeof data !== 'object' || data === null) {
    throw new Error('arena_state: message is not an object')
  }
  const msg = data as { type?: unknown; size?: unknown; tiles?: unknown }

  if (msg.type !== 'arena_state') {
    throw new Error(`arena_state: unexpected message type ${String(msg.type)}`)
  }
  if (typeof msg.size !== 'number' || !Number.isInteger(msg.size) || msg.size <= 0) {
    throw new Error('arena_state: size is not a positive whole number')
  }
  const size = msg.size
  if (!Array.isArray(msg.tiles) || msg.tiles.length !== size * size) {
    throw new Error(`arena_state: want ${size * size} tiles for a ${size}x${size} map`)
  }

  const tiles: Tile[] = []
  for (const value of msg.tiles) {
    if (!isTile(value)) {
      throw new Error(`arena_state: unknown tile value ${String(value)}`)
    }
    tiles.push(value)
  }
  return { size, tiles }
}

/** The game server address on the page's own host; Vite (dev) or Caddy (prod) forwards it. */
function arenaUrl(size: number): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${location.host}/play?size=${size}`
}

/**
 * Opens a WebSocket to the game server and resolves with the first map it sends.
 * Rejects if that message is not a valid arena_state, or if the connection ends
 * first (the browser always fires close after an error, so onerror is not needed).
 */
export function fetchArena(size: number): Promise<Grid> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(arenaUrl(size))

    socket.onmessage = (event: { data: string }) => {
      try {
        resolve(parseArenaState(event.data))
      } catch (err) {
        reject(err)
      } finally {
        socket.close()
      }
    }

    // A Promise settles only once: after a resolve above, this reject does nothing.
    socket.onclose = () => {
      reject(new Error('arena socket closed before the map arrived'))
    }
  })
}
