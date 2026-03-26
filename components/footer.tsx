import Link from "next/link"

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
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-primary-foreground">L</span>
              </div>
              <span className="text-xl font-semibold tracking-tight text-foreground">Lexora</span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Logiciel de comptabilité moderne pour les entreprises, comptables et leurs clients à Maurice.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Produit</h3>
            <ul className="mt-4 space-y-3">
              {navigation.produit.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Entreprise</h3>
            <ul className="mt-4 space-y-3">
              {navigation.entreprise.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground">Légal</h3>
            <ul className="mt-4 space-y-3">
              {navigation.legal.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Lexora. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  )
}
