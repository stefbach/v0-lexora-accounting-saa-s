"use client"

import { useState, useEffect, useCallback } from "react"
import { Settings, Plus, Trash2, Edit2, Save, X, Zap, Search } from "lucide-react"

interface Affectation {
  id: string
  societe_id: string
  fournisseur: string
  fournisseur_patterns: string[]
  compte: string
  libelle_compte: string | null
  journal: string
  auto_lettrage: boolean
  recurrent: boolean
  tva_deductible: boolean
  notes: string | null
  nb_utilisations: number
  derniere_utilisation: string | null
  created_at: string
}

interface Societe {
  id: string
  nom: string
}

const DEFAULT_AFFECTATIONS = [
  { fournisseur: "EMTEL", fournisseur_patterns: ["EMTEL", "MTML", "ORANGE"], compte: "626", libelle_compte: "Telecom", journal: "ACH", auto_lettrage: false, recurrent: true, tva_deductible: true },
  { fournisseur: "CEB", fournisseur_patterns: ["CEB", "CENTRAL ELECTRICITY"], compte: "626", libelle_compte: "Electricite", journal: "ACH", auto_lettrage: false, recurrent: true, tva_deductible: true },
  { fournisseur: "MW PROP", fournisseur_patterns: ["MW PROP", "MWPI"], compte: "612", libelle_compte: "Loyer", journal: "ACH", auto_lettrage: false, recurrent: true, tva_deductible: true },
  { fournisseur: "OPENAI", fournisseur_patterns: ["OPENAI", "VERCEL", "SUPABASE", "AWS", "GITHUB", "ANTHROPIC"], compte: "651", libelle_compte: "SaaS", journal: "ACH", auto_lettrage: true, recurrent: true, tva_deductible: false },
  { fournisseur: "META ADS", fournisseur_patterns: ["META", "FACEBOOK", "GOOGLE ADS"], compte: "623", libelle_compte: "Publicite", journal: "ACH", auto_lettrage: false, recurrent: false, tva_deductible: false },
  { fournisseur: "UBER", fournisseur_patterns: ["UBER", "BOLT"], compte: "624", libelle_compte: "Transport", journal: "ACH", auto_lettrage: true, recurrent: false, tva_deductible: false },
  { fournisseur: "2E2J", fournisseur_patterns: ["2E2J", "E2J"], compte: "622", libelle_compte: "Honoraires", journal: "ACH", auto_lettrage: false, recurrent: false, tva_deductible: true },
]

export default function AffectationsPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSociete, setSelectedSociete] = useState<string>("")
  const [affectations, setAffectations] = useState<Affectation[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Form state
  const [form, setForm] = useState({
    fournisseur: "",
    fournisseur_patterns: "",
    compte: "",
    libelle_compte: "",
    journal: "ACH",
    auto_lettrage: false,
    recurrent: false,
    tva_deductible: true,
    notes: "",
  })

  // Edit form state
  const [editForm, setEditForm] = useState({ ...form })

  // Load societes
  useEffect(() => {
    fetch("/api/client/societes")
      .then(r => r.json())
      .then(data => {
        const socs = data.societes || []
        setSocietes(socs)
        if (socs.length > 0 && !selectedSociete) {
          setSelectedSociete(socs[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Load affectations
  const loadAffectations = useCallback(async () => {
    if (!selectedSociete) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/comptable/affectations?societe_id=${selectedSociete}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAffectations(data.affectations || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedSociete])

  useEffect(() => { loadAffectations() }, [loadAffectations])

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(""), 3000)
  }

  const handleAdd = async () => {
    if (!form.fournisseur || !form.compte) {
      setError("Fournisseur et compte requis")
      return
    }
    setError("")
    try {
      const res = await fetch("/api/comptable/affectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "affecter",
          societe_id: selectedSociete,
          fournisseur: form.fournisseur,
          fournisseur_patterns: form.fournisseur_patterns.split(",").map(p => p.trim()).filter(Boolean),
          compte: form.compte,
          libelle_compte: form.libelle_compte || null,
          journal: form.journal,
          auto_lettrage: form.auto_lettrage,
          recurrent: form.recurrent,
          tva_deductible: form.tva_deductible,
          notes: form.notes || null,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setForm({ fournisseur: "", fournisseur_patterns: "", compte: "", libelle_compte: "", journal: "ACH", auto_lettrage: false, recurrent: false, tva_deductible: true, notes: "" })
      setShowAdd(false)
      showSuccess("Affectation ajoutee")
      loadAffectations()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleEdit = async (id: string) => {
    setError("")
    try {
      const aff = affectations.find(a => a.id === id)
      if (!aff) return
      const res = await fetch("/api/comptable/affectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "affecter",
          societe_id: selectedSociete,
          fournisseur: editForm.fournisseur || aff.fournisseur,
          fournisseur_patterns: editForm.fournisseur_patterns.split(",").map(p => p.trim()).filter(Boolean),
          compte: editForm.compte,
          libelle_compte: editForm.libelle_compte || null,
          journal: editForm.journal,
          auto_lettrage: editForm.auto_lettrage,
          recurrent: editForm.recurrent,
          tva_deductible: editForm.tva_deductible,
          notes: editForm.notes || null,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEditingId(null)
      showSuccess("Affectation modifiee")
      loadAffectations()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette affectation ?")) return
    try {
      const res = await fetch("/api/comptable/affectations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "supprimer", id }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      showSuccess("Affectation supprimee")
      loadAffectations()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleInitDefaults = async () => {
    if (!selectedSociete) return
    if (!confirm("Initialiser les affectations courantes pour cette societe ? Les doublons seront ignores.")) return
    setError("")
    let count = 0
    for (const def of DEFAULT_AFFECTATIONS) {
      try {
        const res = await fetch("/api/comptable/affectations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "affecter",
            societe_id: selectedSociete,
            ...def,
          }),
        })
        const data = await res.json()
        if (data.success) count++
      } catch {}
    }
    showSuccess(`${count} affectations initialisees`)
    loadAffectations()
  }

  const startEdit = (aff: Affectation) => {
    setEditingId(aff.id)
    setEditForm({
      fournisseur: aff.fournisseur,
      fournisseur_patterns: (aff.fournisseur_patterns || []).join(", "),
      compte: aff.compte,
      libelle_compte: aff.libelle_compte || "",
      journal: aff.journal || "ACH",
      auto_lettrage: aff.auto_lettrage,
      recurrent: aff.recurrent,
      tva_deductible: aff.tva_deductible,
      notes: aff.notes || "",
    })
  }

  const filtered = affectations.filter(a => {
    if (!searchQuery) return true
    const q = searchQuery.toUpperCase()
    return a.fournisseur.includes(q) || a.compte.includes(q) || (a.libelle_compte || "").toUpperCase().includes(q)
  })

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-[#0B0F2E] rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-[#D4AF37]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">Affectations comptables</h1>
          <p className="text-sm text-gray-500">Regles automatiques fournisseur &rarr; compte comptable</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
          <button onClick={() => setError("")} className="ml-2 font-bold">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={selectedSociete}
          onChange={e => setSelectedSociete(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
        >
          <option value="">-- Choisir une societe --</option>
          {societes.map(s => (
            <option key={s.id} value={s.id}>{s.nom}</option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent"
          />
        </div>

        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-[#0B0F2E] text-white rounded-lg text-sm hover:bg-[#2a3d6b] transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouvelle affectation
        </button>

        <button
          onClick={handleInitDefaults}
          disabled={!selectedSociete}
          className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#0B0F2E] rounded-lg text-sm hover:bg-[#d4b65e] transition-colors font-semibold disabled:opacity-50"
        >
          <Zap className="w-4 h-4" /> Initialiser les affectations courantes
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h3 className="font-semibold text-[#0B0F2E] mb-3">Nouvelle affectation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fournisseur *</label>
              <input
                type="text"
                value={form.fournisseur}
                onChange={e => setForm({ ...form, fournisseur: e.target.value })}
                placeholder="Ex: EMTEL"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Patterns (virgules)</label>
              <input
                type="text"
                value={form.fournisseur_patterns}
                onChange={e => setForm({ ...form, fournisseur_patterns: e.target.value })}
                placeholder="EMTEL, MTML, ORANGE"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Compte *</label>
              <input
                type="text"
                value={form.compte}
                onChange={e => setForm({ ...form, compte: e.target.value })}
                placeholder="626"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Libelle compte</label>
              <input
                type="text"
                value={form.libelle_compte}
                onChange={e => setForm({ ...form, libelle_compte: e.target.value })}
                placeholder="Telecom"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Journal</label>
              <input
                type="text"
                value={form.journal}
                onChange={e => setForm({ ...form, journal: e.target.value })}
                placeholder="ACH"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes optionnelles"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.auto_lettrage}
                  onChange={e => setForm({ ...form, auto_lettrage: e.target.checked })}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                Auto-lettrage
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.recurrent}
                  onChange={e => setForm({ ...form, recurrent: e.target.checked })}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                Recurrent
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.tva_deductible}
                  onChange={e => setForm({ ...form, tva_deductible: e.target.checked })}
                  className="rounded border-gray-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                />
                TVA deductible
              </label>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={handleAdd}
                className="flex items-center gap-1 px-4 py-2 bg-[#0B0F2E] text-white rounded-lg text-sm hover:bg-[#2a3d6b]"
              >
                <Save className="w-4 h-4" /> Enregistrer
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="flex items-center gap-1 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                <X className="w-4 h-4" /> Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0B0F2E] text-white">
                <th className="px-4 py-3 text-left font-semibold">Fournisseur</th>
                <th className="px-4 py-3 text-left font-semibold">Patterns</th>
                <th className="px-4 py-3 text-left font-semibold">Compte</th>
                <th className="px-4 py-3 text-left font-semibold">Libelle</th>
                <th className="px-4 py-3 text-center font-semibold">Auto-lettrage</th>
                <th className="px-4 py-3 text-center font-semibold">Recurrent</th>
                <th className="px-4 py-3 text-center font-semibold">Utilisations</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Chargement...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    Aucune affectation. Cliquez sur &quot;Initialiser les affectations courantes&quot; pour commencer.
                  </td>
                </tr>
              ) : (
                filtered.map((aff, idx) => (
                  <tr key={aff.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    {editingId === aff.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.fournisseur}
                            onChange={e => setEditForm({ ...editForm, fournisseur: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.fournisseur_patterns}
                            onChange={e => setEditForm({ ...editForm, fournisseur_patterns: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.compte}
                            onChange={e => setEditForm({ ...editForm, compte: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editForm.libelle_compte}
                            onChange={e => setEditForm({ ...editForm, libelle_compte: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={editForm.auto_lettrage}
                            onChange={e => setEditForm({ ...editForm, auto_lettrage: e.target.checked })}
                            className="rounded border-gray-300 text-[#D4AF37]"
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={editForm.recurrent}
                            onChange={e => setEditForm({ ...editForm, recurrent: e.target.checked })}
                            className="rounded border-gray-300 text-[#D4AF37]"
                          />
                        </td>
                        <td className="px-4 py-2 text-center text-gray-400">{aff.nb_utilisations}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleEdit(aff.id)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              title="Sauvegarder"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                              title="Annuler"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-[#0B0F2E]">{aff.fournisseur}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(aff.fournisseur_patterns || []).map((p, i) => (
                              <span key={i} className="inline-block px-2 py-0.5 bg-[#0B0F2E]/10 text-[#0B0F2E] rounded text-xs">
                                {p}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-0.5 bg-[#D4AF37]/20 text-[#0B0F2E] rounded font-mono text-xs font-bold">
                            {aff.compte}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{aff.libelle_compte || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          {aff.auto_lettrage ? (
                            <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Oui</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Non</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {aff.recurrent ? (
                            <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">Oui</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">Non</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-semibold text-[#0B0F2E]">{aff.nb_utilisations}</span>
                          {aff.derniere_utilisation && (
                            <div className="text-xs text-gray-400">
                              {new Date(aff.derniere_utilisation).toLocaleDateString("fr-FR")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(aff)}
                              className="p-1.5 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded"
                              title="Modifier"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(aff.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer stats */}
        {affectations.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex justify-between">
            <span>{affectations.length} affectation{affectations.length > 1 ? "s" : ""} configuree{affectations.length > 1 ? "s" : ""}</span>
            <span>
              Total utilisations: {affectations.reduce((s, a) => s + (a.nb_utilisations || 0), 0)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
