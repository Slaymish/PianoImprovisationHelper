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

function extractArtistName(recording: MusicBrainzRecording): string {
  const credit = recording['artist-credit']
  if (!credit || credit.length === 0) return 'Unknown artist'
  return credit.map((c) => c.name).join(' ')
}

export async function searchTracks(query: string, signal?: AbortSignal): Promise<TrackSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  // MusicBrainz rate limits are strict; keep requests debounced and ask for JSON.
  const url = new URL('https://musicbrainz.org/ws/2/recording')
  url.searchParams.set('query', q)
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
