export type RecognitionMatch = {
  title: string
  artist: string
  confidence: number
}

export type RecognitionResult = {
  ok: boolean
  message: string
  matches: RecognitionMatch[]
}

export async function recognizeSong(signal?: AbortSignal): Promise<RecognitionResult> {
  const res = await fetch('/.netlify/functions/recognize', { signal })
  if (!res.ok) throw new Error(`Recognition request failed (${res.status})`)
  return (await res.json()) as RecognitionResult
}
