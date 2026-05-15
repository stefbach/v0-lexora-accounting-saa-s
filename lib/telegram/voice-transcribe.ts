/**
 * Transcription des messages vocaux Telegram via OpenAI Whisper.
 *
 * Pipeline :
 *   1. Telegram getFile(file_id) → file_path (.oga / Opus)
 *   2. Download via https://api.telegram.org/file/bot<TOKEN>/<file_path>
 *   3. POST multipart vers https://api.openai.com/v1/audio/transcriptions
 *      avec model=whisper-1
 *
 * Pas de SDK lourd : on utilise fetch + FormData natifs Node 20.
 *
 * Pré-requis env :
 *   - TELEGRAM_BOT_TOKEN
 *   - OPENAI_API_KEY (sinon retour explicite "not configured")
 *
 * Limites :
 *   - Whisper API : max 25 Mo, formats audio supportés (oga/ogg OK depuis 2024)
 *   - Latence typique : 2-8 s pour un voice message ~30s
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

export type VoiceTranscribeResult =
  | {
      ok: true
      text: string
      language?: string
      duration_ms: number
      audio_bytes: number
    }
  | { ok: false; error: string; reason?: 'not_configured' | 'download_failed' | 'too_large' | 'transcribe_failed' }

export async function transcribeTelegramVoice(args: {
  file_id: string
  declared_duration_seconds?: number
  language?: string // ex 'fr' / 'en' (hint Whisper)
}): Promise<VoiceTranscribeResult> {
  if (!BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN manquant', reason: 'not_configured' }
  }
  if (!OPENAI_KEY) {
    return {
      ok: false,
      error: 'Voice transcription pas configurée. Définir OPENAI_API_KEY env.',
      reason: 'not_configured',
    }
  }

  const t0 = Date.now()

  // 1. getFile
  const gfRes = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(args.file_id)}`,
  )
  if (!gfRes.ok) {
    return { ok: false, error: `Telegram getFile failed: ${gfRes.status}`, reason: 'download_failed' }
  }
  const gf = await gfRes.json()
  if (!gf?.ok || !gf?.result?.file_path) {
    return { ok: false, error: 'Telegram getFile invalide', reason: 'download_failed' }
  }
  const filePath: string = gf.result.file_path
  const fileSize: number = gf.result.file_size || 0

  if (fileSize > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      error: `Voice trop volumineux (${Math.round(fileSize / 1024 / 1024)} Mo, max 25 Mo)`,
      reason: 'too_large',
    }
  }

  // 2. Download .oga
  const dlRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
  if (!dlRes.ok) {
    return { ok: false, error: `Téléchargement audio échoué: ${dlRes.status}`, reason: 'download_failed' }
  }
  const audioBuf = await dlRes.arrayBuffer()
  const audioBytes = audioBuf.byteLength

  // 3. Whisper transcription
  const inferredName = filePath.split('/').pop() || 'voice.oga'
  const ext = (inferredName.split('.').pop() || 'oga').toLowerCase()
  const contentType = ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'audio/ogg'

  const form = new FormData()
  const blob = new Blob([audioBuf as ArrayBuffer], { type: contentType })
  form.set('file', blob, inferredName)
  form.set('model', 'whisper-1')
  form.set('response_format', 'json')
  if (args.language) form.set('language', args.language)

  let trRes: Response
  try {
    trRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    })
  } catch (e: any) {
    return { ok: false, error: `Whisper fetch error: ${e?.message || e}`, reason: 'transcribe_failed' }
  }

  if (!trRes.ok) {
    const errBody = await trRes.text().catch(() => '')
    return {
      ok: false,
      error: `Whisper API ${trRes.status}: ${errBody.slice(0, 240)}`,
      reason: 'transcribe_failed',
    }
  }

  const trJson: any = await trRes.json().catch(() => ({}))
  const text: string = String(trJson?.text || '').trim()
  if (!text) {
    return { ok: false, error: 'Whisper a renvoyé une transcription vide', reason: 'transcribe_failed' }
  }

  return {
    ok: true,
    text,
    language: trJson?.language,
    duration_ms: Date.now() - t0,
    audio_bytes: audioBytes,
  }
}
