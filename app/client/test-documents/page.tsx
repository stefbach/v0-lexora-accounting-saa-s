"use client"
import { useState, useEffect } from "react"

export default function TestDocuments() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/client/documents")
      .then(r => r.json())
      .then(d => setResult(d))
      .catch(e => setResult({ error: e.message }))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 40, fontSize: 20 }}>Chargement...</div>

  return (
    <div style={{ padding: 40, fontFamily: "monospace", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Test Documents API</h1>

      <div style={{ padding: 16, background: "#f0f0f0", borderRadius: 8, marginBottom: 20 }}>
        <p><strong>Nombre de documents :</strong> {result?.documents?.length || 0}</p>
        <p><strong>Debug dossiers :</strong> {result?._debug?.dossierIds_count || "?"}</p>
        <p><strong>Debug uploaders :</strong> {result?._debug?.uploaderIds_count || "?"}</p>
        <p><strong>Erreur :</strong> {result?.error || "Aucune"}</p>
        <p><strong>Types :</strong> {JSON.stringify([...new Set((result?.documents || []).map((d: any) => d.type_document))])}</p>
        <p><strong>Statuts :</strong> {JSON.stringify([...new Set((result?.documents || []).map((d: any) => d.statut))])}</p>
        <p><strong>Factures fournisseur :</strong> {(result?.documents || []).filter((d: any) => d.type_document === 'facture_fournisseur').length}</p>
      </div>

      {result?.documents?.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#1E2A4A", color: "white" }}>
              <th style={{ padding: 8, textAlign: "left" }}>Fichier</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Statut</th>
              <th style={{ padding: 8 }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {result.documents.map((d: any) => (
              <tr key={d.id} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: 8 }}>{d.nom_fichier}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{d.type_document || "—"}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{d.statut}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{new Date(d.created_at).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <pre style={{ marginTop: 20, padding: 16, background: "#f8f8f8", borderRadius: 8, fontSize: 11, overflow: "auto", maxHeight: 300 }}>
        {JSON.stringify(result?._debug, null, 2)}
      </pre>
    </div>
  )
}
