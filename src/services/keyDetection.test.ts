import { describe, expect, it } from 'vitest'

import {
  detectKeyFromPitchClassHistogram,
  rankKeyCandidatesFromPitchClassHistogram,
} from './keyDetection'

describe('keyDetection', () => {
  it('detects C major from a C-weighted histogram', () => {
    // Strong C/E/G presence
    const hist = [10, 0, 0, 0, 6, 0, 0, 7, 0, 0, 0, 0]
    const res = detectKeyFromPitchClassHistogram(hist)
    expect(res).not.toBeNull()
    expect(res!.tonic).toBe('C')
    expect(res!.mode).toBe('major')
    expect(res!.confidence).toBeGreaterThan(0.5)
  })

  it('ranks plausible candidates with a non-empty histogram', () => {
    const hist = [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
    const ranked = rankKeyCandidatesFromPitchClassHistogram(hist)
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0].tonic).toMatch(/[A-G]/)
  })

  it('returns null on an all-zero histogram', () => {
    const res = detectKeyFromPitchClassHistogram(new Array(12).fill(0))
    expect(res).toBeNull()
  })
})
