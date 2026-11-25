import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'

import ArenaView from '../ArenaView.vue'
import { Tile, type Grid } from '@/game/grid'
import { fetchArena } from '@/net/arenaSocket'
import { FakePen } from '@/game/renderer/__tests__/fakePen'
import { TILE } from '@/game/renderer/tiles'

// Replace the real WebSocket call: these tests are about the page, not the network.
vi.mock('@/net/arenaSocket', () => ({ fetchArena: vi.fn<typeof fetchArena>() }))

/** An all-empty map of the given size; the page only cares that it draws it. */
function emptyGrid(size: number): Grid {
  return { size, tiles: Array<Tile>(size * size).fill(Tile.Empty) }
}

async function mountAt(url: string) {
  await router.push(url)
  return mount(ArenaView, { global: { plugins: [router] } })
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new FakePen() as unknown as CanvasRenderingContext2D,
  )
  vi.mocked(fetchArena).mockImplementation((size) => Promise.resolve(emptyGrid(size)))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(fetchArena).mockReset()
})

describe('ArenaView', () => {
  it('shows a loading text until the map arrives', async () => {
    vi.mocked(fetchArena).mockReturnValue(new Promise(() => {})) // never answers

    const wrapper = await mountAt('/arena/local?size=17')
    await flushPromises()

    expect(wrapper.text()).toContain('Loading the arena')
    expect(wrapper.find('canvas').exists()).toBe(false)
  })

  it('draws the map the server sent', async () => {
    const wrapper = await mountAt('/arena/local?size=21')
    await flushPromises()

    expect(wrapper.get('canvas').element.width).toBe(21 * TILE)
    expect(wrapper.text()).not.toContain('Loading the arena')
  })

  it.each([15, 17, 21])('asks the server for a %i map when the url says so', async (size) => {
    await mountAt('/arena/local?size=' + size)

    expect(fetchArena).toHaveBeenCalledWith(size)
  })

  it.each(['', '?size=asd', '?size=0', '?size=-85', '?size=16', '?size=99'])(
    'asks for the default 17 map when the url has "%s"',
    async (query) => {
      await mountAt('/arena/local' + query)

      expect(fetchArena).toHaveBeenCalledWith(17)
    },
  )

  it('shows an error when the game server cannot be reached', async () => {
    vi.mocked(fetchArena).mockRejectedValue(new Error('arena socket closed before the map arrived'))

    const wrapper = await mountAt('/arena/local?size=17')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('Could not reach the game server')
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Loading the arena')
  })
})
