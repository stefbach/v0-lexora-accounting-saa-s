'use client'

import { useEffect, useState } from 'react'
import type { JurisdictionCode } from './core/types'

export interface JurisdictionInfo {
  code: string
  name: string
  nameFr: string
  framework: string
  currency: string
  zone: string | null
  flag: string
}

export function useJurisdictions() {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/jurisdictions')
      .then(r => r.json())
      .then(data => {
        setJurisdictions(data.jurisdictions || [])
        setLoading(false)
      })
      .catch(err => {
        setError(String(err))
        setLoading(false)
      })
  }, [])

  return { jurisdictions, loading, error }
}

export function useJurisdiction(code: JurisdictionCode | string | undefined) {
  const [details, setDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!code) return
    setLoading(true)
    fetch(`/api/jurisdictions/${code}`)
      .then(r => r.json())
      .then(data => {
        setDetails(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [code])

  return { details, loading }
}

export function useChartOfAccounts(framework: 'SYSCOHADA' | 'PCM' = 'SYSCOHADA') {
  const [chart, setChart] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/jurisdictions/chart-of-accounts?framework=${framework}`)
      .then(r => r.json())
      .then(data => {
        setChart(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [framework])

  return { chart, loading }
}
