import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

export default async function HomePage() {
  const supabase = createClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="bg-gradient-to-r from-sky-500 to-indigo-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent">
        AXIM AI MU
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate-600 dark:text-slate-300">
        Next.js 14 + Supabase + Tailwind CSS + TypeScript — scaffold prêt pour
        production.
      </p>

      <div className="mt-10 flex items-center gap-4">
        {user ? (
          <>
            <Link
              href="/protected"
              className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
            >
              Espace protégé
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Se déconnecter
              </button>
            </form>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-sky-600"
          >
            Se connecter
          </Link>
        )}
      </div>

      {user && (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Connecté en tant que <span className="font-mono">{user.email}</span>
        </p>
      )}
    </main>
  )
}
