import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchArena, parseArenaState } from '../arenaSocket'
import { Tile } from '@/game/grid'
import { FakeSocket, lastSocket } from './fakeSocket'

// A 3x3 map: walls around one empty tile.
const message = JSON.stringify({
  type: 'arena_state',
  size: 3,
  tiles: [1, 1, 1, 1, 0, 1, 1, 1, 1],
})

describe('parseArenaState', () => {
  it('turns an arena_state message into a grid', () => {
    const grid = parseArenaState(message)

    expect(grid.size).toBe(3)
    expect(grid.tiles).toEqual([
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
      Tile.Empty,
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
      Tile.HardWall,
    ])
  })

  it.each([
    ['text that is not JSON', 'hello', /not JSON/],
    ['another message type', JSON.stringify({ type: 'chat', size: 1, tiles: [0] }), /type/],
    ['a size that is not a number', JSON.stringify({ type: 'arena_state', size: '3' }), /size/],
    [
      'the wrong number of tiles',
      JSON.stringify({ type: 'arena_state', size: 2, tiles: [1, 1, 1] }),
      /tiles/,
    ],
    ['an unknown tile value', JSON.stringify({ type: 'arena_state', size: 1, tiles: [7] }), /tile/],
  ])('rejects %s', (_name, text, error) => {
    expect(() => parseArenaState(text)).toThrow(error)
  })
})

describe('fetchArena', () => {
  beforeEach(() => {
    FakeSocket.last = null
    vi.stubGlobal('WebSocket', FakeSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects to /play on the page host with the size', () => {
    void fetchArena(15)

    // jsdom serves the test page from http://localhost:3000.
    expect(lastSocket().url).toBe('ws://localhost:3000/play?size=15')
  })

  it('resolves with the grid from the first message and closes the socket', async () => {
    const promise = fetchArena(3)

    lastSocket().receive(message)

    await expect(promise).resolves.toEqual(parseArenaState(message))
    expect(lastSocket().closed).toBe(true)
  })

  it('rejects when the message is not a valid arena state', async () => {
    const promise = fetchArena(3)

    lastSocket().receive('hello')

    await expect(promise).rejects.toThrow(/not JSON/)
    expect(lastSocket().closed).toBe(true)
  })

  it('rejects when the connection closes before a map arrives', async () => {
    const promise = fetchArena(3)

    lastSocket().drop()

    await expect(promise).rejects.toThrow(/closed before/)
  })
})
