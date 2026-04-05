import Link from "next/link"
import { LexoraLogo } from "@/components/LexoraLogo"

const navigation = {
  produit: [
    { name: "Fonctionnalités", href: "#features" },
    { name: "Sécurité", href: "#" },
  ],
  entreprise: [
    { name: "À propos", href: "#about" },
    { name: "Contact", href: "#contact" },
  ],
  legal: [
    { name: "Confidentialité", href: "#" },
    { name: "Conditions", href: "#" },
    { name: "Cookies", href: "#" },
  ],
}

export function Footer() {
  return (
    <footer style={{ backgroundColor: "#0B0F2E", borderTop: "1px solid #1E2760" }}>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <LexoraLogo href="/" size="md" />
            <p className="mt-4 text-sm leading-relaxed" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300, lineHeight: 1.7 }}>
              Logiciel de comptabilité moderne pour les entreprises, comptables et leurs clients à Maurice.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>Produit</h3>
            <ul className="mt-4 space-y-3">
              {navigation.produit.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm transition-colors hover:text-[#E8EAFC]"
                    style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300 }}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>Entreprise</h3>
            <ul className="mt-4 space-y-3">
              {navigation.entreprise.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm transition-colors hover:text-[#E8EAFC]"
                    style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300 }}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold" style={{ color: "#E8EAFC", fontFamily: "'Poppins', sans-serif", fontWeight: 500 }}>Légal</h3>
            <ul className="mt-4 space-y-3">
              {navigation.legal.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm transition-colors hover:text-[#E8EAFC]"
                    style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300 }}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8" style={{ borderTop: "1px solid #1E2760" }}>
          <p className="text-center text-sm" style={{ color: "#4A5490", fontFamily: "'Poppins', sans-serif", fontWeight: 300 }}>
            &copy; {new Date().getFullYear()} LE<span style={{ color: "#D4AF37" }}>X</span>ORA. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  )
}
