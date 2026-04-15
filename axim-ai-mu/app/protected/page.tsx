import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

export default async function ProtectedPage() {
  const supabase = createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
        ← Retour
      </Link>

      <h1 className="mt-6 text-3xl font-bold">Espace protégé</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        Cette page n'est accessible qu'aux utilisateurs authentifiés.
      </p>

      <pre className="mt-8 overflow-x-auto rounded-md bg-slate-100 p-4 text-xs dark:bg-slate-900">
        {JSON.stringify(
          { id: user.id, email: user.email, created_at: user.created_at },
          null,
          2
        )}
      </pre>

      <form action="/auth/sign-out" method="post" className="mt-6">
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Se déconnecter
        </button>
      </form>
    </main>
  )
}
