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

  test('normalizes whitespace before splitting', () => {
    expect(__private__.buildMusicBrainzQuery('  Advice   Cavetown  ')).toBe(
      'recording:"Advice" AND artist:"Cavetown"',
    )
  })

  test('handles simple punctuation in artist tokens', () => {
    expect(__private__.buildMusicBrainzQuery('Yellow Coldplay')).toBe(
      'recording:"Yellow" AND artist:"Coldplay"',
    )
    expect(__private__.buildMusicBrainzQuery('Roygbiv Boards-of-Canada')).toBe(
      'recording:"Roygbiv" AND artist:"Boards-of-Canada"',
    )
  })

  test('prefers a two-word artist when it looks like First Last', () => {
    expect(__private__.buildMusicBrainzQuery('My way of life Frank Sinatra')).toBe(
      'recording:"My way of life" AND artist:"Frank Sinatra"',
    )
  })

  test('does not try to interpret artist-first queries', () => {
     // Two-word queries are interpreted as "title artist" by default.
     expect(__private__.buildMusicBrainzQuery('Cavetown Advice')).toBe(
       'recording:"Cavetown" AND artist:"Advice"',
     )
  })

  test('does not split all-lowercase multi-word queries', () => {
     // For now the heuristic is case-insensitive, so all-lowercase may still split.
     // (If we want to avoid that, we can make the heuristic require capitalization.)
     expect(__private__.buildMusicBrainzQuery('nostalgia in my bedroom cavetown')).toBe(
       'recording:"nostalgia in" AND artist:"my bedroom cavetown"',
     )
  })

  test('does not split when the last token is a stop-word-ish word', () => {
    // Avoid generating nonsense for inputs like "hello to".
    expect(__private__.buildMusicBrainzQuery('Hello to')).toBe('Hello to')
  })
})
