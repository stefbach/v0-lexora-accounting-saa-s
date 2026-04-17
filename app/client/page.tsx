import { redirect } from 'next/navigation'

// /client is a thin shell that routes to the main dashboard.
// The rich dashboard that previously lived here (691 lines) was not
// reachable via the /redirect flow (which already points to
// /client/tableau-de-bord), so it had become dead code.
// See Section 9.1 of AUDIT_CLIENT_ESPACE.md.
export default function ClientRoot() {
  redirect('/client/tableau-de-bord')
}
