import type { Pen } from '../tiles'

/** One fillRect call, with the colour that was current when it ran. */
export interface Rect {
  color: string
  x: number
  y: number
  w: number
  h: number
}

/** A Pen that draws nothing and records every fillRect call. */
export class FakePen implements Pen {
  fillStyle: Pen['fillStyle'] = ''
  rects: Rect[] = []

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({ color: String(this.fillStyle), x, y, w, h })
  }
}
