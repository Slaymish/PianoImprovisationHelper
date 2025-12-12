import { describe, expect, test, vi } from 'vitest'

import { clearPersistedState, loadPersistedState, savePersistedState } from './persistence'

describe('persistence', () => {
  test('round-trips basic state', () => {
    const store = new Map<string, string>()
    const ls = {
      getItem: vi.fn((k: string) => store.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => void store.set(k, v)),
      removeItem: vi.fn((k: string) => void store.delete(k)),
    }

    vi.stubGlobal('localStorage', ls)

    savePersistedState({
      analysisSeconds: 18,
      song: { title: 'My Way of Life', artist: 'Frank Sinatra', source: 'manual' },
      songInfo: {
        keySignature: { name: 'D minor', confidence: 0.9 },
        timeSignature: null,
        chords: ['i → VI → III → VII'],
      },
      lastQuery: 'My way of life Frank Sinatra',
    })

    const loaded = loadPersistedState()
    expect(loaded?.v).toBe(1)
    expect(loaded?.analysisSeconds).toBe(18)
    expect(loaded?.song?.title).toBe('My Way of Life')
    expect(loaded?.songInfo?.keySignature?.name).toBe('D minor')

    clearPersistedState()
    expect(loadPersistedState()).toBe(null)

    vi.unstubAllGlobals()
  })

  test('returns null on invalid JSON', () => {
    const ls = {
      getItem: vi.fn(() => '{not json'),
      setItem: vi.fn(() => undefined),
      removeItem: vi.fn(() => undefined),
    }

    vi.stubGlobal('localStorage', ls)
    expect(loadPersistedState()).toBe(null)
    vi.unstubAllGlobals()
  })
})
