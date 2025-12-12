import { useEffect, useReducer, useState } from 'react'
import './App.css'

import { useDebouncedValue } from './hooks/useDebouncedValue'
import { searchTracks, type TrackSearchResult } from './services/musicbrainz'
import { detectKeyFromAudioUrlWithCandidates, type KeyCandidate } from './services/keyDetection'
import { lookupPreviewUrl } from './services/itunes'
import { recognizeSong } from './services/recognition'
import { suggestProgressionsForKey } from './services/chords'

import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { Spinner } from './components/ui/Spinner'
import { ProgressBar } from './components/ui/ProgressBar'

type AppStage = 'idle' | 'listening' | 'fetchingInfo' | 'ready' | 'error'

type SongSource = 'manual' | 'recognition'

type Song = {
  title: string
  artist: string
  source: SongSource
  previewUrl?: string
  artworkUrl?: string
}

type SongInfo = {
  keySignature:
    | { name: string; confidence: number; candidates?: Array<{ name: string; score: number }> }
    | null
  timeSignature: string | null
  chords: string[]
}

type AppState = {
  stage: AppStage
  song: Song | null
  songInfo: SongInfo | null
  errorMessage: string | null
}

type AppAction =
  | { type: 'LISTEN_START' }
  | { type: 'LISTEN_STOP' }
  | { type: 'SONG_SELECTED'; song: Song }
  | { type: 'INFO_FETCH_START' }
  | { type: 'INFO_FETCH_SUCCESS'; songInfo: SongInfo }
  | { type: 'INFO_FETCH_ERROR'; message: string }
  | { type: 'RESET' }

const initialState: AppState = {
  stage: 'idle',
  song: null,
  songInfo: null,
  errorMessage: null,
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LISTEN_START':
      return { ...state, stage: 'listening', errorMessage: null }
    case 'LISTEN_STOP':
      return { ...state, stage: 'idle' }
    case 'SONG_SELECTED':
      return {
        ...state,
        song: action.song,
        songInfo: null,
        errorMessage: null,
        stage: 'fetchingInfo',
      }
    case 'INFO_FETCH_START':
      return { ...state, stage: 'fetchingInfo', errorMessage: null }
    case 'INFO_FETCH_SUCCESS':
      return { ...state, stage: 'ready', songInfo: action.songInfo, errorMessage: null }
    case 'INFO_FETCH_ERROR':
      return { ...state, stage: 'error', errorMessage: action.message }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

type SongInfoOpts = {
  secondsToAnalyze: number
}

const keyCache = new Map<string, SongInfo['keySignature']>()

function candidateLabel(c: KeyCandidate): string {
  return `${c.tonic} ${c.mode}`
}

async function fakeFetchSongInfo(song: Song, opts: SongInfoOpts): Promise<SongInfo> {
  // Attempt to detect key from a CORS-enabled preview URL.
  // If we can't fetch one, we still return info but with keySignature null.
  let keySignature: SongInfo['keySignature'] = null

  if (song.previewUrl) {
    try {
      const cacheKey = `${song.previewUrl}::${opts.secondsToAnalyze}`
      const cached = keyCache.get(cacheKey)
      if (cached) {
        keySignature = cached
      } else {
        const summary = await detectKeyFromAudioUrlWithCandidates(song.previewUrl, {
          secondsToAnalyze: opts.secondsToAnalyze,
        })
        if (summary) {
          const top2 = summary.topCandidates.slice(0, 2)
          keySignature = {
            name: `${summary.best.tonic} ${summary.best.mode}`,
            confidence: summary.best.confidence,
            candidates: top2.map((c) => ({ name: candidateLabel(c), score: c.score })),
          }
          keyCache.set(cacheKey, keySignature)
        }
      }
    } catch {
      // If analysis fails, just treat the key as unknown.
      keySignature = null
    }
  }

  let chords: string[] = []
  if (keySignature) {
    const [tonic, mode] = keySignature.name.split(' ') as [string, 'major' | 'minor']
    const suggestions = suggestProgressionsForKey({ tonic, mode })
    // Show a compact, friendly set of suggestions.
    chords = [
      ...suggestions.progressions.slice(0, 3).map((p) => `${p.roman}  (${p.chords.join(' – ')})`),
    ]
  }

  return {
    keySignature,
    timeSignature: null,
    chords,
  }
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 350)
  const [searchState, setSearchState] = useState<
    | { status: 'idle'; results: TrackSearchResult[]; error: null }
    | { status: 'loading'; results: TrackSearchResult[]; error: null }
    | { status: 'success'; results: TrackSearchResult[]; error: null }
    | { status: 'error'; results: TrackSearchResult[]; error: string }
  >({ status: 'idle', results: [], error: null })

  const trimmedQuery = debouncedQuery.trim()
  const displayedResults = trimmedQuery ? searchState.results : []
  const displayedSearchError = trimmedQuery ? searchState.error : null
  const displayedIsSearching = trimmedQuery ? searchState.status === 'loading' : false

  const [previewStatus, setPreviewStatus] = useState<
    'idle' | 'lookingUp' | 'found' | 'notFound' | 'error'
  >('idle')
  const [analysisSeconds, setAnalysisSeconds] = useState(18)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  const [recognitionStatus, setRecognitionStatus] = useState<'idle' | 'calling' | 'done' | 'error'>(
    'idle',
  )
  const [recognitionMessage, setRecognitionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (state.stage !== 'fetchingInfo' || !state.song) return
    let cancelled = false

    queueMicrotask(() => setAnalysisProgress(0))
    const startedAt = Date.now()
    const progressTimer = window.setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      setAnalysisProgress(Math.max(0, Math.min(0.95, elapsed / analysisSeconds)))
    }, 120)

    dispatch({ type: 'INFO_FETCH_START' })
    fakeFetchSongInfo(state.song, { secondsToAnalyze: analysisSeconds })
      .then((songInfo) => {
        if (cancelled) return
        setAnalysisProgress(1)
        dispatch({ type: 'INFO_FETCH_SUCCESS', songInfo })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        dispatch({ type: 'INFO_FETCH_ERROR', message })
      })

    return () => {
      cancelled = true
      window.clearInterval(progressTimer)
    }
  }, [state.stage, state.song, analysisSeconds])

  useEffect(() => {
    if (state.stage !== 'idle') return
    const q = debouncedQuery.trim()
    if (!q) return

    const controller = new AbortController()
    // Mark loading, but do it via an async tick to satisfy react-hooks/set-state-in-effect.
    queueMicrotask(() => {
      if (controller.signal.aborted) return
      setSearchState((prev) => ({ status: 'loading', results: prev.results, error: null }))
    })

    searchTracks(q, controller.signal)
      .then((r) => setSearchState({ status: 'success', results: r, error: null }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        setSearchState({ status: 'error', results: [], error: message })
      })

    return () => controller.abort()
  }, [debouncedQuery, state.stage])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__titleWrap">
          <h1 className="app__title">Piano Improvisation Helper</h1>
          <p className="app__subtitle">Find a song → auto-detect key → get improv hints</p>
        </div>
        {state.stage !== 'idle' && (
          <Button variant="ghost" type="button" onClick={() => dispatch({ type: 'RESET' })}>
            Back
          </Button>
        )}
      </header>

      {state.stage === 'idle' && (
        <div className="stack">
          <Card title="Find a song" subtitle="Search by title and artist (MusicBrainz)">
            <div className="row">
              <Button variant="primary" type="button" onClick={() => dispatch({ type: 'LISTEN_START' })}>
                Listen for song
              </Button>
              <span className="hint">
                Mic recognition isn’t plugged in yet — search works best for now.
              </span>
            </div>

            <div className="field" style={{ marginTop: 12 }} aria-busy={displayedIsSearching}>
              <label className="label" htmlFor="songSearch">
                Search
              </label>
              <input
                className="input"
                id="songSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a song title and/or artist…"
                autoComplete="off"
              />

              <div className="hint">
                {displayedIsSearching ? (
                  <Spinner label="Searching…" />
                ) : displayedSearchError ? (
                  `Search error: ${displayedSearchError}`
                ) : previewStatus === 'lookingUp' ? (
                  <Spinner label="Looking up preview clip…" />
                ) : previewStatus === 'notFound' ? (
                  'No preview clip found for the last selection — key detection may not work for that track.'
                ) : previewStatus === 'error' ? (
                  'Preview lookup failed — you can still try another track.'
                ) : (
                  ' '
                )}
              </div>

              {trimmedQuery && !displayedIsSearching && !displayedSearchError && displayedResults.length === 0 && (
                <div className="hint">No results yet. Try adding the artist name.</div>
              )}

              {displayedResults.length > 0 && (
                <div className="list" role="listbox" aria-label="Search results">
                  {displayedResults.map((r: TrackSearchResult) => (
                    <button
                      key={r.id}
                      type="button"
                      className="listItem"
                      role="option"
                      onClick={async () => {
                        // Try to fetch a preview URL so we can do real audio key detection.
                        let previewUrl: string | undefined
                        let artworkUrl: string | undefined
                        try {
                          setPreviewStatus('lookingUp')
                          const preview = await lookupPreviewUrl({ title: r.title, artist: r.artist })
                          previewUrl = preview?.previewUrl
                          artworkUrl = preview?.artworkUrl
                          setPreviewStatus(previewUrl ? 'found' : 'notFound')
                        } catch {
                          previewUrl = undefined
                          artworkUrl = undefined
                          setPreviewStatus('error')
                        }

                        dispatch({
                          type: 'SONG_SELECTED',
                          song: {
                            title: r.title,
                            artist: r.artist,
                            source: 'manual',
                            previewUrl,
                            artworkUrl,
                          },
                        })
                      }}
                    >
                      <div className="listItem__title">{r.title}</div>
                      <div className="listItem__subtitle">{r.artist}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {state.stage === 'listening' && (
        <div className="stack">
          <Card title="Listening" subtitle="This is just the wiring for now">
            <div className="row">
              <Button variant="ghost" type="button" onClick={() => dispatch({ type: 'LISTEN_STOP' })}>
                Stop
              </Button>

              <Button
                variant="secondary"
                type="button"
                onClick={async () => {
                  setRecognitionStatus('calling')
                  setRecognitionMessage(null)
                  try {
                    const r = await recognizeSong()
                    setRecognitionStatus('done')
                    setRecognitionMessage(r.message)
                  } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : 'Unknown error'
                    setRecognitionStatus('error')
                    setRecognitionMessage(message)
                  }
                }}
              >
                Test recognition call
              </Button>

              <Button
                variant="primary"
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'SONG_SELECTED',
                    song: { title: 'Recognized Song', artist: 'Recognized Artist', source: 'recognition' },
                  })
                }
              >
                Simulate match
              </Button>
            </div>

            <div className="hint" style={{ marginTop: 10 }}>
              {recognitionStatus === 'calling' ? (
                <Spinner label="Calling recognition…" />
              ) : recognitionMessage ? (
                recognitionMessage
              ) : (
                ' '
              )}
            </div>
          </Card>
        </div>
      )}

      {state.stage === 'fetchingInfo' && (
        <div className="stack">
          <Card title="Analyzing" subtitle="Finding key from the preview clip">
            {state.song && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {state.song.artworkUrl && (
                  <img
                    src={state.song.artworkUrl}
                    alt=""
                    width={56}
                    height={56}
                    style={{ borderRadius: 12, flex: '0 0 auto' }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 800 }}>{state.song.title}</div>
                  <div className="hint">{state.song.artist}</div>
                </div>
              </div>
            )}

            <div className="row" style={{ marginTop: 8 }}>
              {state.song?.previewUrl ? (
                <div style={{ width: '100%' }}>
                  <ProgressBar value={analysisProgress} label={`Analyzing preview (~${analysisSeconds}s)`} />
                </div>
              ) : (
                <Spinner
                  label={
                    previewStatus === 'lookingUp'
                      ? 'Step 1/2: Looking up a preview clip…'
                      : previewStatus === 'notFound'
                        ? 'No preview clip found (key detection may be unavailable)'
                        : 'Working…'
                  }
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {state.stage === 'ready' && state.song && state.songInfo && (
        <div className="stack">
          <Card title="Song info" subtitle="Improv-friendly summary">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {state.song.artworkUrl && (
                <img
                  src={state.song.artworkUrl}
                  alt=""
                  width={56}
                  height={56}
                  style={{ borderRadius: 12, flex: '0 0 auto' }}
                />
              )}
              <div>
                <div style={{ fontWeight: 800 }}>{state.song.title}</div>
                <div className="hint">{state.song.artist}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <div className="label">Key</div>
                <div style={{ marginTop: 4 }}>
                  {state.songInfo.keySignature
                    ? `${state.songInfo.keySignature.name} · ${Math.round(
                        state.songInfo.keySignature.confidence * 100,
                      )}% confidence`
                    : 'Unknown (no preview available / blocked by CORS)'}
                </div>
                {state.songInfo.keySignature?.candidates &&
                  state.songInfo.keySignature.candidates.length > 1 && (
                    <div className="hint" style={{ marginTop: 4 }}>
                      Alternate guess: {state.songInfo.keySignature.candidates[1].name}
                    </div>
                  )}
              </div>

              <div>
                <div className="label">Time signature</div>
                <div style={{ marginTop: 4 }}>{state.songInfo.timeSignature ?? 'Unknown'}</div>
              </div>

              <div>
                <div className="label">Chord ideas</div>
                {state.songInfo.chords.length > 0 ? (
                  <div className="stack" style={{ marginTop: 8, gap: 6 }}>
                    {state.songInfo.chords.map((c) => (
                      <div key={c}>{c}</div>
                    ))}
                  </div>
                ) : (
                  <div className="hint" style={{ marginTop: 4 }}>
                    Detect a key first to get chord suggestions.
                  </div>
                )}
              </div>
            </div>

            <div className="row" style={{ marginTop: 14 }}>
              <Button variant="secondary" type="button" onClick={() => dispatch({ type: 'INFO_FETCH_START' })}>
                Try again
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={() => {
                  setAnalysisSeconds((s) => Math.min(30, s + 6))
                  dispatch({ type: 'INFO_FETCH_START' })
                }}
                disabled={analysisSeconds >= 30}
              >
                Analyze longer (+6s)
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setAnalysisSeconds(18)
                  dispatch({ type: 'INFO_FETCH_START' })
                }}
                disabled={analysisSeconds === 18}
              >
                Reset length
              </Button>
            </div>
          </Card>
        </div>
      )}

      {state.stage === 'error' && (
        <div className="stack">
          <Card title="Something went wrong" subtitle="You can go back and try again">
            <p style={{ marginTop: 0 }}>{state.errorMessage ?? 'Unknown error'}</p>
            <div className="row">
              <Button variant="primary" type="button" onClick={() => dispatch({ type: 'RESET' })}>
                Back
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default App
