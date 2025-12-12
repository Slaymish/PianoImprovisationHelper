import type { KeyCandidate } from './keyDetection'

export type PersistedSong = {
  title: string
  artist: string
  source: 'manual' | 'recognition'
  previewUrl?: string
  artworkUrl?: string
}

export type PersistedSongInfo = {
  keySignature:
    | {
        name: string
        confidence: number
        candidates?: Array<{ name: string; score: number }>
      }
    | null
  timeSignature: string | null
  chords: string[]
}

export type PersistedStateV1 = {
  v: 1
  savedAt: number
  analysisSeconds: number
  song: PersistedSong | null
  songInfo: PersistedSongInfo | null
  lastQuery?: string
}

const STORAGE_KEY = 'piano-improv-helper:v1'

export function loadPersistedState(): PersistedStateV1 | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const s = parsed as Partial<PersistedStateV1>
    if (s.v !== 1) return null
    if (typeof s.analysisSeconds !== 'number') return null

    return {
      v: 1,
      savedAt: typeof s.savedAt === 'number' ? s.savedAt : Date.now(),
      analysisSeconds: s.analysisSeconds,
      song: (s.song ?? null) as PersistedSong | null,
      songInfo: (s.songInfo ?? null) as PersistedSongInfo | null,
      lastQuery: typeof s.lastQuery === 'string' ? s.lastQuery : undefined,
    }
  } catch {
    return null
  }
}

export function savePersistedState(next: Omit<PersistedStateV1, 'v' | 'savedAt'>): void {
  const payload: PersistedStateV1 = {
    v: 1,
    savedAt: Date.now(),
    ...next,
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore write failures (private mode / storage full)
  }
}

export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

// Helpers that make it easier to persist only tiny shapes.
export function toPersistedCandidates(
  candidates?: Array<{ name: string; score: number }> | undefined,
): Array<{ name: string; score: number }> | undefined {
  if (!candidates || candidates.length === 0) return undefined
  return candidates.map((c) => ({ name: c.name, score: c.score }))
}

export function toKeyCandidatesLabelOnly(candidates: KeyCandidate[]): Array<{ name: string; score: number }> {
  return candidates.map((c) => ({ name: `${c.tonic} ${c.mode}`, score: c.score }))
}
