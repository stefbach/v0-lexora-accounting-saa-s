'use client'

import { useState } from 'react'

export function CurrencyConverter() {
  const [amount, setAmount] = useState<number>(1000)
  const [from, setFrom] = useState('EUR')
  const [to, setTo] = useState('MUR')
  const [result, setResult] = useState<{ amount: number; rate: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const convert = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/forex/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, from, to }),
      })
      const data = await r.json()
      if (data.amount) {
        setResult({ amount: data.amount, rate: data.rate.rate })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border rounded-lg p-6 max-w-md">
      <h3 className="font-bold mb-4">Convertisseur de Devises</h3>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="flex-1 px-3 py-2 border rounded-md text-lg font-mono"
          />
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            {['EUR', 'USD', 'GBP', 'MUR', 'XOF', 'XAF', 'CNY', 'INR'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="text-center text-gray-400">↓</div>

        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={result ? result.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'}
            className="flex-1 px-3 py-2 border rounded-md text-lg font-mono bg-gray-50"
          />
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            {['EUR', 'USD', 'GBP', 'MUR', 'XOF', 'XAF', 'CNY', 'INR'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {result && (
          <div className="text-xs text-gray-500 text-center">
            Taux: 1 {from} = {result.rate.toFixed(6)} {to}
          </div>
        )}

        <button
          onClick={convert}
          disabled={loading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Conversion...' : 'Convertir'}
        </button>
      </div>
    </div>
  )
}
