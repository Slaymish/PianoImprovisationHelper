export type KeyDetectionResult = {
  tonic: string
  mode: 'major' | 'minor'
  confidence: number
  profile: number[]
}

export type KeyCandidate = {
  tonic: string
  mode: 'major' | 'minor'
  score: number
}

// Krumhansl-Schmuckler key profiles (normalized later)
// Source: common music cognition profiles; values are widely published.
const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
]
const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
]

const TONICS_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

function rotate<T>(arr: readonly T[], n: number): T[] {
  const len = arr.length
  const k = ((n % len) + len) % len
  return arr.slice(k).concat(arr.slice(0, k))
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function dot(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a))
}

function corr(a: number[], b: number[]): number {
  // Pearson correlation, stable enough for our small vectors.
  const am = mean(a)
  const bm = mean(b)
  const ac = a.map((x) => x - am)
  const bc = b.map((x) => x - bm)
  const denom = norm(ac) * norm(bc)
  if (denom === 0) return 0
  return dot(ac, bc) / denom
}

function normalizeHistogram(hist: number[]): number[] {
  const total = hist.reduce((a, b) => a + b, 0)
  if (total <= 0) return hist.map(() => 0)
  return hist.map((x) => x / total)
}

export function detectKeyFromPitchClassHistogram(hist: number[]): KeyDetectionResult | null {
  if (hist.length !== 12) {
    throw new Error('Pitch class histogram must have length 12')
  }
  const h = normalizeHistogram(hist)
  const maxBin = Math.max(...h)
  if (maxBin <= 0) return null

  let best: { tonicIndex: number; mode: 'major' | 'minor'; score: number } | null = null

  for (let tonicIndex = 0; tonicIndex < 12; tonicIndex++) {
    const maj = rotate(MAJOR_PROFILE, tonicIndex)
    const min = rotate(MINOR_PROFILE, tonicIndex)

    const majScore = corr(h, maj)
    const minScore = corr(h, min)

    if (!best || majScore > best.score) best = { tonicIndex, mode: 'major', score: majScore }
    if (!best || minScore > best.score) best = { tonicIndex, mode: 'minor', score: minScore }
  }

  if (!best) return null

  // Convert correlation roughly into 0..1 confidence.
  const confidence = Math.max(0, Math.min(1, (best.score + 1) / 2))

  return {
    tonic: TONICS_SHARP[best.tonicIndex],
    mode: best.mode,
    confidence,
    profile: h,
  }
}

export function rankKeyCandidatesFromPitchClassHistogram(hist: number[]): KeyCandidate[] {
  if (hist.length !== 12) {
    throw new Error('Pitch class histogram must have length 12')
  }
  const h = normalizeHistogram(hist)
  const maxBin = Math.max(...h)
  if (maxBin <= 0) return []

  const candidates: KeyCandidate[] = []
  for (let tonicIndex = 0; tonicIndex < 12; tonicIndex++) {
    const maj = rotate(MAJOR_PROFILE, tonicIndex)
    const min = rotate(MINOR_PROFILE, tonicIndex)
    candidates.push({ tonic: TONICS_SHARP[tonicIndex], mode: 'major', score: corr(h, maj) })
    candidates.push({ tonic: TONICS_SHARP[tonicIndex], mode: 'minor', score: corr(h, min) })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

export type AudioKeyDetectionOptions = {
  secondsToAnalyze?: number
  fftSize?: number
  frames?: number
}

export async function detectKeyFromAudioUrl(
  audioUrl: string,
  { secondsToAnalyze = 18, fftSize = 4096, frames = 96 }: AudioKeyDetectionOptions = {},
): Promise<KeyDetectionResult | null> {
  // Note: this relies on CORS-enabled audio URLs.
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

  if (!AudioContextCtor) throw new Error('Web Audio API not supported in this browser')

  const ctx = new AudioContextCtor()

  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`)
  const buf = await res.arrayBuffer()
  const audio = await ctx.decodeAudioData(buf)

  const sampleRate = audio.sampleRate
  const length = Math.min(audio.length, Math.floor(secondsToAnalyze * sampleRate))

  // Mixdown to mono
  const channelData = audio.numberOfChannels > 0 ? audio.getChannelData(0) : new Float32Array(length)
  const mono = channelData.subarray(0, length)

  const analyser = ctx.createAnalyser()
  analyser.fftSize = fftSize

  const src = ctx.createBufferSource()
  const segment = ctx.createBuffer(1, length, sampleRate)
  segment.copyToChannel(mono, 0)

  src.buffer = segment
  src.connect(analyser)

  // We don't connect to destination (silent analysis)
  src.start(0)

  const freqBins = new Float32Array(analyser.frequencyBinCount)
  const hist = new Array<number>(12).fill(0)

  // Small IIR smoothing so single frames don't dominate.
  const smooth = new Array<number>(12).fill(0)
  const alpha = 0.85

  // Sample a few frames across the segment.
  for (let i = 0; i < frames; i++) {
    await new Promise((r) => setTimeout(r, Math.floor((secondsToAnalyze * 1000) / frames)))
    analyser.getFloatFrequencyData(freqBins)

    // Convert dB bins to linear-ish magnitude and accumulate into pitch classes.
    for (let bin = 1; bin < freqBins.length; bin++) {
      const db = freqBins[bin]
      if (!Number.isFinite(db)) continue

      // Ignore very quiet bins
      if (db < -85) continue

      const freq = (bin * sampleRate) / analyser.fftSize
      if (freq < 50 || freq > 2000) continue

      const mag = Math.pow(10, db / 20)
      const midi = 69 + 12 * Math.log2(freq / 440)
      const pc = ((Math.round(midi) % 12) + 12) % 12
      hist[pc] += mag
    }

    // Smooth histogram over time
    for (let pc = 0; pc < 12; pc++) {
      smooth[pc] = alpha * smooth[pc] + (1 - alpha) * hist[pc]
    }
  }

  src.stop()
  src.disconnect()
  analyser.disconnect()
  await ctx.close()

  return detectKeyFromPitchClassHistogram(smooth)
}

export type AudioKeyDetectionSummary = {
  best: KeyDetectionResult
  topCandidates: KeyCandidate[]
}

export async function detectKeyFromAudioUrlWithCandidates(
  audioUrl: string,
  options: AudioKeyDetectionOptions = {},
): Promise<AudioKeyDetectionSummary | null> {
  const res = await detectKeyFromAudioUrl(audioUrl, options)
  if (!res) return null

  // Re-run ranking using the returned normalized profile (pitch-class distribution).
  const candidates = rankKeyCandidatesFromPitchClassHistogram(res.profile).slice(0, 5)
  return {
    best: res,
    topCandidates: candidates,
  }
}
