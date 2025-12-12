import type { Handler } from '@netlify/functions'

type RecognizeResponse = {
  ok: boolean
  message: string
  matches: Array<{
    title: string
    artist: string
    confidence: number
  }>
}

export const handler: Handler = async () => {
  // Placeholder endpoint.
  // Later: accept an audio snippet, call a recognition provider, and return best matches.
  const body: RecognizeResponse = {
    ok: true,
    message:
      'Recognition isn’t implemented yet. This endpoint will eventually call a music recognition provider.',
    matches: [],
  }

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  }
}
