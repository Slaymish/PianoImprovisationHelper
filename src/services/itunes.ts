export type ITunesSearchResult = {
  trackId?: number
  trackName?: string
  artistName?: string
  previewUrl?: string
  artworkUrl100?: string
  kind?: string
}

export type ITunesSearchResponse = {
  resultCount: number
  results: ITunesSearchResult[]
}

export type PreviewLookupInput = {
  title: string
  artist: string
}

export type PreviewLookupResult = {
  previewUrl: string
  display: string
  artworkUrl?: string
}

function scoreResult(input: PreviewLookupInput, r: ITunesSearchResult): number {
  const title = (r.trackName ?? '').toLowerCase()
  const artist = (r.artistName ?? '').toLowerCase()
  const wantTitle = input.title.toLowerCase()
  const wantArtist = input.artist.toLowerCase()

  let score = 0
  if (title === wantTitle) score += 5
  if (artist === wantArtist) score += 5
  if (title.includes(wantTitle) || wantTitle.includes(title)) score += 2
  if (artist.includes(wantArtist) || wantArtist.includes(artist)) score += 2
  if (r.previewUrl) score += 3
  if (r.kind === 'song') score += 2
  return score
}

export async function lookupPreviewUrl(
  input: PreviewLookupInput,
  signal?: AbortSignal,
): Promise<PreviewLookupResult | null> {
  const term = `${input.title} ${input.artist}`.trim()
  if (!term) return null

  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', term)
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '10')

  const res = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) throw new Error(`iTunes search failed (${res.status})`)

  const data = (await res.json()) as ITunesSearchResponse
  const results = data.results ?? []

  const withPreview = results.filter((r) => !!r.previewUrl)
  if (withPreview.length === 0) return null

  withPreview.sort((a, b) => scoreResult(input, b) - scoreResult(input, a))
  const best = withPreview[0]
  if (!best.previewUrl) return null

  return {
    previewUrl: best.previewUrl,
    display: `${best.trackName ?? input.title} — ${best.artistName ?? input.artist}`,
    artworkUrl: best.artworkUrl100,
  }
}
