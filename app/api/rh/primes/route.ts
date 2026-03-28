import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode') // YYYY-MM
    const employe_id = searchParams.get('employe_id')
    const type = searchParams.get('type') // 'catalogue' | 'saisie'

    if (type === 'saisie' || periode) {
      // Récupérer les primes saisies pour le mois
      let query = supabase
        .from('primes_variables_mois')
        .select('*, employe:employes(nom,prenom,poste), prime:catalogue_primes(code,libelle,type_prime)')
        .order('created_at', { ascending: false })
      if (periode) query = query.eq('periode', `${periode}-01`)
      if (employe_id) query = query.eq('employe_id', employe_id)
      if (societe_id) {
        const { data: emps } = await supabase.from('employes').select('id').eq('societe_id', societe_id)
        const ids = emps?.map(e => e.id) || []
        if (ids.length) query = query.in('employe_id', ids)
      }
      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ primes: data, nb: data?.length || 0 })
    }

    // Récupérer le catalogue
    let catQuery = supabase.from('catalogue_primes').select('*').order('code')
    if (societe_id) catQuery = catQuery.or(`societe_id.eq.${societe_id},societe_id.is.null`)
    const { data, error } = await catQuery
    if (error) throw error
    return NextResponse.json({ primes: data, nb: data?.length || 0 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { action } = body

    if (action === 'creer_catalogue') {
      const { code, libelle, type_prime, montant_fixe, montant_par_unite, unite, pourcentage, bonus_objectif_montant, periode_application, societe_id, postes_eligibles } = body
      if (!libelle || !type_prime) return NextResponse.json({ error: 'libelle et type_prime requis' }, { status: 400 })

      const autoCode = code || `PRM-${Date.now().toString(36).toUpperCase()}`
      const { data, error } = await supabase.from('catalogue_primes').insert({
        code: autoCode, libelle, type_prime,
        montant_fixe: montant_fixe || null,
        montant_par_unite: montant_par_unite || null,
        unite: unite || null,
        pourcentage: pourcentage || null,
        bonus_objectif_montant: bonus_objectif_montant || null,
        periode_application: periode_application || 'mensuel',
        societe_id: societe_id || null,
        postes_eligibles: postes_eligibles || null,
        actif: true,
      }).select().single()
      if (error) throw error
      return NextResponse.json({ prime: data })
    }

    if (action === 'saisir') {
      const { employe_id, prime_id, periode, quantite, montant_force, notes, societe_id } = body
      if (!employe_id || !prime_id || !periode) return NextResponse.json({ error: 'employe_id, prime_id, periode requis' }, { status: 400 })

      // Récupérer la prime du catalogue
      const { data: prime } = await supabase.from('catalogue_primes').select('*').eq('id', prime_id).single()
      if (!prime) return NextResponse.json({ error: 'Prime non trouvée' }, { status: 404 })

      // Calculer le montant
      let montant = 0
      if (montant_force) {
        montant = montant_force
      } else {
        switch (prime.type_prime) {
          case 'fixe':
            montant = prime.montant_fixe || 0
            break
          case 'variable_unitaire':
            montant = (quantite || 0) * (prime.montant_par_unite || 0)
            break
          case 'pourcentage': {
            // Récupérer le salaire de base de l'employé
            const { data: emp } = await supabase.from('employes').select('salaire_base').eq('id', employe_id).single()
            montant = Math.round(Number(emp?.salaire_base || 0) * (Number(prime.pourcentage) / 100) * 100) / 100
            break
          }
          case 'bonus_objectif':
            montant = prime.bonus_objectif_montant || 0
            break
          case 'commission':
            montant = (quantite || 0) * (prime.montant_par_unite || 0)
            break
        }
      }

      const periodeDate = `${periode}-01`
      const { data, error } = await supabase.from('primes_variables_mois').upsert({
        employe_id, prime_id, periode: periodeDate, quantite: quantite || null,
        montant: Math.round(montant * 100) / 100,
        notes: notes || null,
        saisi_par: user.id,
        approuve: false,
        integre_paie: false,
      }, { onConflict: 'employe_id,prime_id,periode' }).select().single()
      if (error) throw error
      return NextResponse.json({ prime_mois: data, montant_calcule: montant })
    }

    if (action === 'approuver') {
      const { id } = body
      const { data, error } = await supabase.from('primes_variables_mois')
        .update({ approuve: true, approuve_par: user.id, approuve_at: new Date().toISOString() })
        .eq('id', id).select().single()
      if (error) throw error
      return NextResponse.json({ prime_mois: data })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
