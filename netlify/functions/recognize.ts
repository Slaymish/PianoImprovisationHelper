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
  // Stub endpoint.
  // Later: accept an audio snippet (multipart/form-data or base64), call a recognition provider,
  // and return best matches.
  const body: RecognizeResponse = {
    ok: true,
    message:
      'Recognition stub. This is where we will call a real music recognition provider from Netlify Functions.',
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
