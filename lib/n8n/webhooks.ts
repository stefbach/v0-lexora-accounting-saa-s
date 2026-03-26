export async function triggerDocumentProcessing(params: {
  document_id: string
  storage_path: string
  nom_fichier: string
  client_id: string
  societe?: string
}) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL_DOCUMENTS
  if (!webhookUrl) {
    throw new Error('N8N_WEBHOOK_URL_DOCUMENTS is not configured')
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    throw new Error(`n8n webhook failed: ${response.statusText}`)
  }

  return response.json()
}

export async function triggerTVACalculation(params: {
  client_id: string
  societe: string
  periode: string
}) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL_TVA
  if (!webhookUrl) {
    throw new Error('N8N_WEBHOOK_URL_TVA is not configured')
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    throw new Error(`n8n webhook failed: ${response.statusText}`)
  }

  return response.json()
}
