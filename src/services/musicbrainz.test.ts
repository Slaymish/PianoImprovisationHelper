import { describe, expect, test } from 'vitest'

import { __private__ } from './musicbrainz'

describe('musicbrainz query building', () => {
  test('keeps simple queries as-is', () => {
    expect(__private__.buildMusicBrainzQuery('sinatra')).toBe('sinatra')
    expect(__private__.buildMusicBrainzQuery('  my way  ')).toBe('my way')
  })

  test('turns a combined title+artist string into a fielded query', () => {
    expect(__private__.buildMusicBrainzQuery('My way of life Frank Sinatra')).toBe(
      'recording:"My way of life" AND artist:"Frank Sinatra"',
    )
  })

  test('does not try to split very short inputs', () => {
    expect(__private__.buildMusicBrainzQuery('My way Sinatra')).toBe('My way Sinatra')
  })

  test('handles single-word artists', () => {
    expect(__private__.buildMusicBrainzQuery('Advice Cavetown')).toBe(
      'recording:"Advice" AND artist:"Cavetown"',
    )
  })
})
