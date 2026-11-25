/** Retro arena colours, from docs/mockups/arena.js, grouped by the tile they paint. */
export const PAL = {
  floor: {
    /** Checkerboard shade when (x + y) is odd. */
    dark: '#171e30',
    /** Checkerboard shade when (x + y) is even. */
    light: '#1a2236',
    /** Strip under a wall that is above the floor tile. */
    shadowTop: 'rgba(0,0,0,.28)',
    /** Strip next to a wall that is left of the floor tile. */
    shadowLeft: 'rgba(0,0,0,.16)',
  },
  hard: {
    face: '#39446a',
    highlight: '#5a6a96',
    side: '#46537d',
    bottom: '#232a42',
  },
  soft: {
    brick: '#8a5a3a',
    highlight: '#b07a50',
    bottom: '#5a3824',
    mortar: '#432a1b',
  },
} as const
