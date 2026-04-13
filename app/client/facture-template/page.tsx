import { redirect } from 'next/navigation'

// Template management is now consolidated into /client/facturation-settings
// under the "Modeles" tab. This page redirects for backward compatibility.
export default function FactureTemplateRedirect() {
  redirect('/client/facturation-settings?tab=modeles')
}
