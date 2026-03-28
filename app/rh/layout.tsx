import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RHLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  return (
    <div className="flex min-h-screen bg-gray-50">
      <RHSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}

function RHSidebar() {
  const links = [
    { href: '/rh', label: 'Tableau de bord', icon: '📊' },
    { href: '/rh/employes', label: 'Employés', icon: '👥' },
    { href: '/rh/pointage', label: 'Pointage temps réel', icon: '⏰' },
    { href: '/rh/pointage/mensuel', label: 'Pointage mensuel', icon: '📅' },
    { href: '/rh/conges', label: 'Absences & Congés', icon: '🏖️' },
    { href: '/rh/paie/primes', label: 'Primes', icon: '🎯' },
    { href: '/rh/paie', label: 'Paie & Bulletins', icon: '💰' },
    { href: '/rh/paie/exports-mra', label: 'Exports MRA', icon: '🏛️' },
    { href: '/rh/juridique', label: 'Juridique', icon: '⚖️' },
    { href: '/rh/chat', label: 'Chat CLARA', icon: '🤖' },
    { href: '/rh/paie/parametres', label: 'Paramètres paie', icon: '⚙️' },
  ]
  return (
    <aside className="w-60 bg-[#1E2A4A] min-h-screen flex flex-col">
      <div className="p-4 border-b border-white/10">
        <p className="text-[#C9A84C] font-bold text-lg">LEXORA</p>
        <p className="text-white/60 text-xs">Module RH & Paie</p>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {links.map(l => (
          <a key={l.href} href={l.href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-white text-sm transition-colors">
            <span className="text-base">{l.icon}</span><span>{l.label}</span>
          </a>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10">
        <a href="/comptable" className="flex items-center gap-2 text-white/50 hover:text-white text-xs px-3 py-2">← Retour Comptabilité</a>
      </div>
    </aside>
  )
}
