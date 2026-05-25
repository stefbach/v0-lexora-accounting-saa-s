import { useEffect, useState } from "react"

/**
 * Hook utilitaire pour débouncer une valeur (typiquement un input de
 * recherche). Renvoie `value` mais avec un délai `delay` ms après le
 * dernier changement, ce qui évite de spammer une API d'autocomplétion
 * à chaque frappe.
 *
 * @example
 *   const [q, setQ] = useState("")
 *   const debouncedQ = useDebouncedValue(q, 400)
 *   useEffect(() => { fetch(`/api/search?q=${debouncedQ}`) }, [debouncedQ])
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
