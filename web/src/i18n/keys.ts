/** Flattens a nested dictionary into dotted keys: { a: { b: 'x' } } → ['a.b']. */
export function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix === '' ? key : `${prefix}.${key}`
    if (typeof value === 'object' && value !== null) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/** Reports whether two dictionaries have exactly the same dotted keys (values are ignored). */
export function sameKeys(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = flattenKeys(a).sort()
  const keysB = flattenKeys(b).sort()
  return keysA.length === keysB.length && keysA.every((key, i) => key === keysB[i])
}
