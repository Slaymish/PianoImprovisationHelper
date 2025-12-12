import { useEffect, useReducer, useState } from 'react'
import './App.css'

import { useDebouncedValue } from './hooks/useDebouncedValue'
import { searchTracks, type TrackSearchResult } from './services/musicbrainz'
import { detectKeyFromAudioUrlWithCandidates, type KeyCandidate } from './services/keyDetection'
import { lookupPreviewUrl } from './services/itunes'
import { recognizeSongStub } from './services/recognition'

type AppStage = 'idle' | 'listening' | 'fetchingInfo' | 'ready' | 'error'

type SongSource = 'manual' | 'recognition'

type Song = {
  title: string
  artist: string
  source: SongSource
  previewUrl?: string
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
  // MVP: attempt to detect key from a CORS-enabled preview URL.
  // If unavailable, we still return info but with keySignature null.
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
      // Swallow for MVP; we'll surface a warning later.
      keySignature = null
    }
  }

  return {
    keySignature,
    timeSignature: null,
    chords: ['I', 'V', 'vi', 'IV'],
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

  const [recognitionStatus, setRecognitionStatus] = useState<'idle' | 'calling' | 'done' | 'error'>(
    'idle',
  )
  const [recognitionMessage, setRecognitionMessage] = useState<string | null>(null)

  useEffect(() => {
    if (state.stage !== 'fetchingInfo' || !state.song) return
    let cancelled = false

    dispatch({ type: 'INFO_FETCH_START' })
    fakeFetchSongInfo(state.song, { secondsToAnalyze: analysisSeconds })
      .then((songInfo) => {
        if (cancelled) return
        dispatch({ type: 'INFO_FETCH_SUCCESS', songInfo })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unknown error'
        dispatch({ type: 'INFO_FETCH_ERROR', message })
      })

    return () => {
      cancelled = true
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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Piano Improvisation Helper</h1>
        {state.stage !== 'idle' && (
          <button type="button" onClick={() => dispatch({ type: 'RESET' })}>
            Back
          </button>
        )}
      </header>

      {state.stage === 'idle' && (
        <section style={{ marginTop: 16 }}>
          <p style={{ marginTop: 0 }}>
            Find a song, then we’ll show handy improv info (key, time signature, chords).
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => dispatch({ type: 'LISTEN_START' })}>
              Listen for Song
            </button>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={{ display: 'block', fontWeight: 600 }} htmlFor="songSearch">
              Search
            </label>
            <input
              id="songSearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type a song title and/or artist…"
              style={{ width: '100%', padding: 10, marginTop: 8 }}
            />

            <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85 }}>
              {displayedIsSearching
                ? 'Searching…'
                : displayedSearchError
                  ? `Search error: ${displayedSearchError}`
                  : null}
            </div>

            {displayedResults.length > 0 && (
              <div style={{ marginTop: 10, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }}>
                {displayedResults.map((r: TrackSearchResult) => (
                  <button
                    key={r.id}
                    type="button"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 12,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                    onClick={async () => {
                      // Best-effort: fetch a preview URL so we can do real audio key detection.
                      let previewUrl: string | undefined
                      try {
                        setPreviewStatus('lookingUp')
                        const preview = await lookupPreviewUrl({ title: r.title, artist: r.artist })
                        previewUrl = preview?.previewUrl
                        setPreviewStatus(previewUrl ? 'found' : 'notFound')
                      } catch {
                        previewUrl = undefined
                        setPreviewStatus('error')
                      }

                      dispatch({
                        type: 'SONG_SELECTED',
                        song: { title: r.title, artist: r.artist, source: 'manual', previewUrl },
                      })
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{r.title}</div>
                    <div style={{ opacity: 0.8, fontSize: 13 }}>{r.artist}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {state.stage === 'listening' && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>Listening…</h2>
          <p>
            This is wired to a Netlify Function stub now. Next we’ll add mic capture and send audio.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => dispatch({ type: 'LISTEN_STOP' })}>
              Stop
            </button>
            <button
              type="button"
              onClick={async () => {
                setRecognitionStatus('calling')
                setRecognitionMessage(null)
                try {
                  const r = await recognizeSongStub()
                  setRecognitionStatus('done')
                  setRecognitionMessage(r.message)
                } catch (err: unknown) {
                  const message = err instanceof Error ? err.message : 'Unknown error'
                  setRecognitionStatus('error')
                  setRecognitionMessage(message)
                }
              }}
            >
              Call recognition stub
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'SONG_SELECTED',
                  song: { title: 'Recognized Song', artist: 'Recognized Artist', source: 'recognition' },
                })
              }
            >
              Simulate Found Song
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 14, opacity: 0.85 }}>
            {recognitionStatus === 'calling'
              ? 'Calling recognition…'
              : recognitionMessage
                ? recognitionMessage
                : null}
          </div>
        </section>
      )}

      {state.stage === 'fetchingInfo' && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>Searching for Song Info…</h2>
          {state.song && (
            <p>
              <strong>{state.song.title}</strong> — {state.song.artist}
            </p>
          )}
          <p style={{ opacity: 0.8 }}>
            {state.song?.previewUrl
              ? `Analyzing preview audio (~${analysisSeconds}s)…`
              : previewStatus === 'lookingUp'
                ? 'Looking up a preview clip…'
                : previewStatus === 'notFound'
                  ? 'No preview clip found. Key detection may be unavailable.'
                  : 'Getting key / time signature / chord suggestions…'}
          </p>
        </section>
      )}

      {state.stage === 'ready' && state.song && state.songInfo && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>Song Info</h2>
          <p>
            <strong>{state.song.title}</strong> — {state.song.artist}
          </p>
          <ul>
            <li>
              Key signature:{' '}
              {state.songInfo.keySignature
                ? `${state.songInfo.keySignature.name} (confidence ${Math.round(
                    state.songInfo.keySignature.confidence * 100,
                  )}%)`
                : 'Unknown (need preview URL or fallback)'}
            </li>
            {state.songInfo.keySignature?.candidates && state.songInfo.keySignature.candidates.length > 1 && (
              <li style={{ opacity: 0.9 }}>
                Alternate guess: {state.songInfo.keySignature.candidates[1].name}
              </li>
            )}
            <li>Time signature: {state.songInfo.timeSignature ?? 'Unknown (MVP)'}</li>
            <li>Chords: {state.songInfo.chords.join(' → ')}</li>
          </ul>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            <button type="button" onClick={() => dispatch({ type: 'INFO_FETCH_START' })}>
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                setAnalysisSeconds((s) => Math.min(30, s + 6))
                dispatch({ type: 'INFO_FETCH_START' })
              }}
              disabled={analysisSeconds >= 30}
            >
              Analyze longer (+6s)
            </button>
            <button
              type="button"
              onClick={() => {
                setAnalysisSeconds(18)
                dispatch({ type: 'INFO_FETCH_START' })
              }}
              disabled={analysisSeconds === 18}
            >
              Reset analysis length
            </button>
          </div>
        </section>
      )}

      {state.stage === 'error' && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 18 }}>Something went wrong</h2>
          <p>{state.errorMessage ?? 'Unknown error'}</p>
          <button type="button" onClick={() => dispatch({ type: 'RESET' })}>
            Back
          </button>
        </section>
      )}
    </div>
  )
}

export default App
