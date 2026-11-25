/**
 * A stand-in for the browser WebSocket. It never connects anywhere: the test
 * plays the server by calling receive() and drop().
 */
export class FakeSocket {
  /** The socket the code under test created last, so the test can reach it. */
  static last: FakeSocket | null = null

  readonly url: string
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    FakeSocket.last = this
  }

  close(): void {
    this.closed = true
  }

  /** The server sends a text message. */
  receive(data: string): void {
    this.onmessage?.({ data })
  }

  /** The connection ends: the browser fires close after an error, too. */
  drop(): void {
    this.onclose?.()
  }
}

/** Returns the socket the code created last, failing loudly if there is none. */
export function lastSocket(): FakeSocket {
  if (FakeSocket.last === null) {
    throw new Error('no WebSocket was created')
  }
  return FakeSocket.last
}
