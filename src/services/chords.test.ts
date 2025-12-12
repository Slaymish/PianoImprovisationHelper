import { describe, expect, test } from 'vitest'

import { suggestProgressionsForKey } from './chords'

describe('chord suggestions from key', () => {
  test('C major diatonic triads look right', () => {
    const s = suggestProgressionsForKey({ tonic: 'C', mode: 'major' })
    const diatonic = s.diatonicChords.map((d) => d.chord)
    expect(diatonic).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'])

    const pop = s.progressions.find((p) => p.name.includes('I–V–vi–IV'))
    expect(pop?.chords).toEqual(['C', 'G', 'Am', 'F'])
  })

  test('D minor diatonic triads look right (natural minor)', () => {
    const s = suggestProgressionsForKey({ tonic: 'D', mode: 'minor' })
    const diatonic = s.diatonicChords.map((d) => d.chord)
    expect(diatonic).toEqual(['Dm', 'Edim', 'F', 'Gm', 'Am', 'A#', 'C'])

    const pop = s.progressions.find((p) => p.name.includes('Pop'))
    // i–VI–III–VII in D minor
    expect(pop?.chords).toEqual(['Dm', 'A#', 'F', 'C'])
  })
})
