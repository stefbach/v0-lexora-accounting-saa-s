"use client"
import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface SocieteClient {
  id: string
  nom: string
  brn: string
  ern: string
  type_acces: string
  nb_dossiers_en_cours: number
  docs_en_attente: number
  derniere_ecriture: string | null
}

export default function MesClientsPage() {
  const [societes, setSocietes] = useState<SocieteClient[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/comptable/mes-societes")
      .then(r => r.json())
      .then(d => { setSocietes(d.societes || []); setLoading(false) })
  }, [])

  const badgeAcces = (type: string) => {
    if (type === 'comptable_dedie') return <Badge className="bg-purple-100 text-purple-800 text-xs">Dédié</Badge>
    if (type === 'lecture') return <Badge variant="outline" className="text-xs">Lecture</Badge>
    return <Badge className="bg-blue-100 text-blue-800 text-xs">Comptable</Badge>
  }

  const totalDocs = societes.reduce((s, c) => s + (c.docs_en_attente || 0), 0)
  const totalDossiers = societes.reduce((s, c) => s + (c.nb_dossiers_en_cours || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1E2A4A]">Mes Clients</h1>
        <p className="text-sm text-gray-500">Sociétés dont vous êtes le comptable</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Sociétés</p>
          <p className="text-2xl font-bold text-[#1E2A4A]">{societes.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Docs en attente</p>
          <p className={`text-2xl font-bold ${totalDocs > 0 ? 'text-orange-500' : 'text-green-600'}`}>{totalDocs}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Dossiers actifs</p>
          <p className="text-2xl font-bold text-blue-600">{totalDossiers}</p>
        </CardContent></Card>
      </div>

      {/* Grille clients */}
      {loading ? (
        <div className="text-center text-gray-400 py-12">Chargement...</div>
      ) : societes.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Aucune société assignée</p>
          <p className="text-sm mt-1">Contactez l'administrateur pour obtenir des accès.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {societes.map(s => (
            <Card key={s.id} className="hover:shadow-md transition-shadow border-l-4 border-l-[#1E2A4A]">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-[#1E2A4A] text-base">{s.nom}</p>
                    {s.brn && <p className="text-xs text-gray-400">BRN : {s.brn}</p>}
                  </div>
                  {badgeAcces(s.type_acces)}
                </div>

                {/* Indicateurs */}
                <div className="flex gap-2 flex-wrap">
                  {s.docs_en_attente > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                      📄 {s.docs_en_attente} doc{s.docs_en_attente > 1 ? 's' : ''} en attente
                    </span>
                  )}
                  {s.nb_dossiers_en_cours > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      📁 {s.nb_dossiers_en_cours} dossier{s.nb_dossiers_en_cours > 1 ? 's' : ''}
                    </span>
                  )}
                  {s.derniere_ecriture && (
                    <span className="text-xs text-gray-400">
                      Dernière écriture : {new Date(s.derniere_ecriture).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </div>

                {/* Boutons rapides */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Link href={`/comptable/grand-livre?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">📒 Grand Livre</Button>
                  </Link>
                  <Link href={`/client/documents?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">
                      📄 Documents {s.docs_en_attente > 0 && <span className="ml-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{s.docs_en_attente}</span>}
                    </Button>
                  </Link>
                  <Link href={`/rh/paie?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">👥 Paie</Button>
                  </Link>
                  <Link href={`/comptable/tva?societe_id=${s.id}`}>
                    <Button variant="outline" size="sm" className="w-full text-xs">🏛️ TVA</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
