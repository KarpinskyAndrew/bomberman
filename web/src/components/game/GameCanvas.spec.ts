import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GameCanvas from './GameCanvas.vue'
import { parseGrid } from '@/game/grid'
import { drawGrid } from '@/game/renderer/tiles'
import { FakePen } from '@/game/renderer/__tests__/fakePen'

const map = `
  #+.
  ...
  .+#
`

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GameCanvas', () => {
  it('draws the grid on its canvas when mounted', () => {
    const pen = new FakePen()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      pen as unknown as CanvasRenderingContext2D,
    )
    const grid = parseGrid(map)

    const wrapper = mount(GameCanvas, { props: { grid } })

    expect(wrapper.get('canvas').element.width).toBe(48)
    const expected = new FakePen()
    drawGrid(expected, grid)
    expect(pen.rects).toEqual(expected.rects)
  })
})
