import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const checks: Record<string, string> = {}

  // Check env vars
  checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING'
  checks.SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY) ? 'SET' : 'MISSING'
  checks.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'
  checks.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'not set (default)'

  // Test Supabase connection
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data, error } = await supabase.from('profiles').select('id').limit(1)
      checks.supabase_db = error ? `ERROR: ${error.message}` : `OK (${data?.length} rows)`

      // Test storage bucket
      const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
      if (bucketsError) {
        checks.supabase_storage = `ERROR: ${bucketsError.message}`
      } else {
        const bucketNames = buckets?.map(b => b.name) || []
        checks.supabase_storage_buckets = bucketNames.join(', ') || 'NONE'
        checks.documents_bucket = bucketNames.includes('documents') ? 'EXISTS' : 'MISSING — CREATE IT IN SUPABASE DASHBOARD'
      }
    }
  } catch (e: any) {
    checks.supabase_connection = `FAILED: ${e.message}`
  }

  // Test Anthropic
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const res = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say OK' }],
      })
      checks.anthropic_api = `OK (${res.model})`
    }
  } catch (e: any) {
    checks.anthropic_api = `FAILED: ${e.message}`
  }

  return NextResponse.json({ status: 'debug', checks })
}
