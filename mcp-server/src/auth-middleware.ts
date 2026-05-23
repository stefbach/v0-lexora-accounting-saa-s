/**
 * API Key validation middleware for MCP Server
 * Validates LEXORA_API_KEY before allowing tool execution
 */

export async function validateApiKey(apiKey: string, lexoraApiUrl: string): Promise<{
  valid: boolean
  userId?: string
  societeId?: string
  scopes?: string[]
  error?: string
}> {
  if (!apiKey || !apiKey.startsWith('sk_live_')) {
    return {
      valid: false,
      error: 'Invalid API key format. Must start with sk_live_'
    }
  }

  try {
    const response = await fetch(`${lexoraApiUrl}/api/auth/validate-api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey })
    })

    const result = await response.json()

    if (!result.valid) {
      return {
        valid: false,
        error: result.reason || 'API key validation failed'
      }
    }

    return {
      valid: true,
      userId: result.user_id,
      societeId: result.societe_id,
      scopes: result.scopes || []
    }
  } catch (err: any) {
    return {
      valid: false,
      error: `Validation error: ${err.message}`
    }
  }
}

export function requireScope(scopes: string[] = [], requiredScope: string): boolean {
  return scopes.includes(requiredScope) || scopes.includes('*')
}

export function getMcpServerContext(validation: {
  userId?: string
  societeId?: string
  scopes?: string[]
}) {
  return {
    userId: validation.userId || 'unknown',
    societeId: validation.societeId,
    canRead: validation.scopes?.includes('read:all') || validation.scopes?.includes('read:entries') || false,
    canWrite: validation.scopes?.includes('write:entries') || validation.scopes?.includes('write:all') || false,
  }
}
