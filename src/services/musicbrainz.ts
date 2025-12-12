export type MusicBrainzRecording = {
  id: string
  title: string
  score?: number
  'artist-credit'?: Array<{ name: string }>
}

export type MusicBrainzSearchResponse = {
  recordings?: MusicBrainzRecording[]
}

export type TrackSearchResult = {
  id: string
  title: string
  artist: string
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function guessTitleArtist(raw: string): { title: string; artist: string } | null {
  // Very small heuristic: if the user types something like
  // "my way of life frank sinatra" we treat the last 1–3 words as artist.
  // This isn't perfect, but it helps a lot for common "title artist" searches.
  const s = normalizeSpaces(raw)
  const parts = s.split(' ').filter(Boolean)
  if (parts.length < 4) return null

  const titleStopWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with'])
  const looksTitleWord = (w: string) => titleStopWords.has(w.toLowerCase())
  const looksNameWord = (w: string) => /^[A-Z][\p{L}'’-]*$/u.test(w)

  // Common case: "<title words> <First> <Last>".
  // If the last two tokens look like names, prefer treating them as the artist.
  if (parts.length >= 4) {
    const a1 = parts[parts.length - 2]
    const a2 = parts[parts.length - 1]
    if (looksNameWord(a1) && looksNameWord(a2) && !looksTitleWord(a1) && !looksTitleWord(a2)) {
      const title = parts.slice(0, -2).join(' ')
      const artist = `${a1} ${a2}`
      if (title.length >= 2) return { title, artist }
    }
  }

  // Fallback: try a few splits. We *try* longer artists first, but avoid cases where the artist
  // would start with a common title stop-word.
  for (const artistWords of [3, 2, 1]) {
    if (parts.length <= artistWords + 1) continue
    const artist = parts.slice(-artistWords).join(' ')
    const title = parts.slice(0, -artistWords).join(' ')

    const artistFirstWord = parts[parts.length - artistWords]
    if (artistWords >= 3 && looksTitleWord(artistFirstWord)) continue

    if (title.length >= 2 && artist.length >= 2) return { title, artist }
  }

  return null
}

function buildMusicBrainzQuery(raw: string): string {
  const q = normalizeSpaces(raw)
  if (!q) return ''

  // If the user brackets artist/title explicitly, respect that.
  // MusicBrainz query syntax supports fielded search.
  // https://musicbrainz.org/doc/Development/XML_Web_Service/Version_2/Search
  const guessed = guessTitleArtist(q)
  if (guessed) {
    // Quote to avoid the AND version of the query becoming too restrictive word-by-word.
    return `recording:"${guessed.title}" AND artist:"${guessed.artist}"`
  }

  return q
}

function extractArtistName(recording: MusicBrainzRecording): string {
  const credit = recording['artist-credit']
  if (!credit || credit.length === 0) return 'Unknown artist'
  return credit.map((c) => c.name).join(' ')
}

export async function searchTracks(query: string, signal?: AbortSignal): Promise<TrackSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const mbQuery = buildMusicBrainzQuery(q)
  if (!mbQuery) return []

  // MusicBrainz rate limits are strict; keep requests debounced and ask for JSON.
  const url = new URL('https://musicbrainz.org/ws/2/recording')
  url.searchParams.set('query', mbQuery)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', '10')

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      // MusicBrainz asks for a proper UA. Browser limits custom UA, but we can at least identify via app header.
      'Accept': 'application/json',
    },
  })

  if (!res.ok) {
    throw new Error(`MusicBrainz search failed (${res.status})`)
  }

  const data = (await res.json()) as MusicBrainzSearchResponse
  const recordings = data.recordings ?? []

  return recordings.map((r) => ({
    id: r.id,
    title: r.title,
    artist: extractArtistName(r),
  }))
}

// Exported for tests.
export const __private__ = {
  buildMusicBrainzQuery,
  guessTitleArtist,
}
