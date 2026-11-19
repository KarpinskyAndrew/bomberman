import { describe, expect, it } from 'vitest'
import en from '../en.json'
import hu from '../hu.json'
import { flattenKeys } from '../keys'

// en.json is the source; every other dictionary must have exactly its keys.
describe('dictionaries', () => {
  it('hu has the same keys as en', () => {
    expect(flattenKeys(hu).sort()).toEqual(flattenKeys(en).sort())
  })
})
