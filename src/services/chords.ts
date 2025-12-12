export type Key = {
  tonic: string
  mode: 'major' | 'minor'
}

type Mode = Key['mode']

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

function noteIndex(note: string): number {
  const idx = NOTES_SHARP.indexOf(note as (typeof NOTES_SHARP)[number])
  if (idx === -1) throw new Error(`Unsupported tonic: ${note}`)
  return idx
}

function transpose(note: string, semitones: number): string {
  const i = noteIndex(note)
  return NOTES_SHARP[(i + semitones + 1200) % 12]
}

function buildScale(tonic: string, mode: Mode): string[] {
  // Natural minor for now (works well for improv suggestions without getting too theory-heavy).
  const steps = mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]
  return steps.map((s) => transpose(tonic, s))
}

type DegreeQuality = 'maj' | 'min' | 'dim'

function diatonicTriadQuality(mode: Mode): DegreeQuality[] {
  // Triads on scale degrees.
  // Major: I ii iii IV V vi vii°
  // Minor (natural): i ii° III iv v VI VII
  return mode === 'major'
    ? ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']
    : ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj']
}

function chordName(root: string, quality: DegreeQuality): string {
  if (quality === 'maj') return root
  if (quality === 'min') return `${root}m`
  return `${root}dim`
}

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] as const

export type SuggestedProgression = {
  name: string
  roman: string
  chords: string[]
}

export function suggestProgressionsForKey(key: Key): {
  diatonicChords: Array<{ degree: number; roman: string; chord: string }>
  progressions: SuggestedProgression[]
} {
  const scale = buildScale(key.tonic, key.mode)
  const qualities = diatonicTriadQuality(key.mode)
  const roman = key.mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR

  const diatonicChords = scale.map((note, i) => ({
    degree: i + 1,
    roman: roman[i],
    chord: chordName(note, qualities[i]),
  }))

  const byDegree = (d: number) => diatonicChords[d - 1].chord
  const romanLine = (degrees: number[]) => degrees.map((d) => roman[d - 1]).join(' → ')
  const chordLine = (degrees: number[]) => degrees.map(byDegree)

  const defs: Array<{ name: string; degreesMaj: number[]; degreesMin: number[] }> = [
    {
      name: 'Pop (I–V–vi–IV)',
      degreesMaj: [1, 5, 6, 4],
      degreesMin: [1, 6, 3, 7], // Natural minor pop-ish: i–VI–III–VII
    },
    {
      name: 'Cadence (ii–V–I)',
      degreesMaj: [2, 5, 1],
      degreesMin: [2, 5, 1], // In minor this is a softer cadence (no raised leading tone)
    },
    {
      name: 'Rock (I–bVII–IV)',
      degreesMaj: [1, 7, 4],
      degreesMin: [1, 7, 4],
    },
    {
      name: 'Circle-ish (vi–ii–V–I)',
      degreesMaj: [6, 2, 5, 1],
      degreesMin: [6, 2, 5, 1],
    },
  ]

  const degrees = (d: { degreesMaj: number[]; degreesMin: number[] }) =>
    key.mode === 'major' ? d.degreesMaj : d.degreesMin

  const progressions: SuggestedProgression[] = defs.map((d) => {
    const deg = degrees(d)
    return {
      name: d.name,
      roman: romanLine(deg),
      chords: chordLine(deg),
    }
  })

  return { diatonicChords, progressions }
}
