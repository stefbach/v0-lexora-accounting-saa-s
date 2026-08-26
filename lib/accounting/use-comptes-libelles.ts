"use client"

/**
 * useComptesLibelles — résolveur code → affichage neutre (libellé) réutilisable.
 *
 * Charge le plan comptable de la société une fois et fournit `libelle(compte)`
 * qui rend l'affichage neutre (libellé seul, repli code). Pour les surfaces qui
 * n'ont que le code d'un compte (écritures, exports…) et pas son libellé.
 */

import { useCallback, useEffect, useState } from 'react'
import { afficherCompte } from './compte-display'

export function useComptesLibelles(societeId?: string | null) {
  const [map, setMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!societeId) {
      setMap(new Map())
      return
    }
    let cancel = false
    fetch(`/api/client/plan-comptable?societe_id=${societeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancel) return
        const m = new Map<string, string>()
        for (const c of d?.comptes || []) {
          if (c?.compte) m.set(String(c.compte), c.libelle || '')
        }
        setMap(m)
      })
      .catch(() => {
        /* dégradation propre : le résolveur retombe sur le code */
      })
    return () => {
      cancel = true
    }
  }, [societeId])

  /** Rend un compte en affichage neutre (libellé si connu, sinon le code). */
  const libelle = useCallback(
    (compte: string) => afficherCompte({ compte, libelle: map.get(compte) }),
    [map],
  )

  return { libelle, map }
}
