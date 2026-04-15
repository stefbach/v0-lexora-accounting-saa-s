"use client"

import { useEffect, useState } from "react"

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? "border-white/10 bg-axon-ink/80 backdrop-blur-2xl"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <a href="#" className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 26 26" fill="none">
            <rect width="26" height="26" rx="6" fill="#6C4FF0" />
            <circle cx="13" cy="13" r="2.4" fill="#00BBEE" />
            <line
              x1="13"
              y1="13"
              x2="13"
              y2="5"
              stroke="white"
              strokeWidth="1.3"
              strokeOpacity=".75"
            />
            <line
              x1="13"
              y1="13"
              x2="19.9"
              y2="17"
              stroke="white"
              strokeWidth="1.3"
              strokeOpacity=".75"
            />
            <line
              x1="13"
              y1="13"
              x2="6.1"
              y2="17"
              stroke="white"
              strokeWidth="1.3"
              strokeOpacity=".75"
            />
            <circle cx="13" cy="5" r="1.8" fill="white" fillOpacity=".9" />
            <circle cx="19.9" cy="17" r="1.8" fill="white" fillOpacity=".9" />
            <circle cx="6.1" cy="17" r="1.8" fill="white" fillOpacity=".9" />
          </svg>
          <span className="font-display text-lg font-extrabold tracking-wide">
            AXON AI
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {[
            ["Nos agents", "#agents"],
            ["Secteurs", "#secteurs"],
            ["Voix IA", "#voix"],
            ["Tarifs", "#tarifs"],
            ["Process", "#process"]
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              className="text-[13px] text-axon-txt2 transition hover:text-axon-txt"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-[9px] uppercase tracking-wider text-axon-txt3 md:block">
            axon-ai.mu
          </span>
          <a
            href="#contact"
            className="rounded-lg bg-axon-violet px-4 py-2 text-[12px] font-medium text-white transition hover:bg-axon-violetLight"
          >
            Démo gratuite →
          </a>
        </div>
      </div>
    </nav>
  )
}
