/**
 * Calcule le nombre de jours ouvrés entre deux dates (inclus),
 * en tenant compte des jours travaillés de l'employé et des jours fériés.
 *
 * @param dateDebut      Date de début (incluse)
 * @param dateFin        Date de fin (incluse)
 * @param workingDays    Jours travaillés de l'employé (mon..sun)
 * @param joursFeries    Liste des jours fériés à exclure
 * @returns              Nombre de jours ouvrés (entier, ≥ 0)
 *
 * Mapping Date.getDay(): 0=sun, 1=mon, 2=tue, 3=wed, 4=thu, 5=fri, 6=sat
 */
export function calculateWorkingDays(
  dateDebut: Date,
  dateFin: Date,
  workingDays: {
    mon: boolean
    tue: boolean
    wed: boolean
    thu: boolean
    fri: boolean
    sat: boolean
    sun: boolean
  },
  joursFeries: Date[] = []
): number {
  // Normalise les dates à minuit UTC pour éviter les problèmes de fuseau horaire
  const start = new Date(Date.UTC(
    dateDebut.getFullYear(),
    dateDebut.getMonth(),
    dateDebut.getDate()
  ))
  const end = new Date(Date.UTC(
    dateFin.getFullYear(),
    dateFin.getMonth(),
    dateFin.getDate()
  ))

  if (end < start) return 0

  // Construit un Set des jours fériés normalisés (clé = YYYY-MM-DD UTC)
  const feriesSet = new Set(
    joursFeries.map(d => {
      const normalized = new Date(Date.UTC(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
      ))
      return normalized.toISOString().slice(0, 10)
    })
  )

  // Mapping jour de semaine (0=sun ... 6=sat) vers clé workingDays
  const dayKeys: Array<keyof typeof workingDays> = [
    'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'
  ]

  let count = 0
  const cursor = new Date(start)

  while (cursor <= end) {
    const dayKey = dayKeys[cursor.getUTCDay()]
    const isoDate = cursor.toISOString().slice(0, 10)

    if (workingDays[dayKey] && !feriesSet.has(isoDate)) {
      count++
    }

    // Avance d'un jour
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return count
}
