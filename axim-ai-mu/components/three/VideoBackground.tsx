"use client"

/**
 * Futuristic animated background — no external video asset required.
 * Uses layered CSS gradients + SVG noise + animated orbs to simulate
 * a living, breathing video backdrop. Extremely performant.
 *
 * Drop in an actual <video> source (MP4 loop) by uncommenting the <video>
 * block below and setting the asset path in /public/media/.
 */
export default function VideoBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Optional real video — provide /public/media/neural-loop.mp4 */}
      {/*
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen"
      >
        <source src="/media/neural-loop.mp4" type="video/mp4" />
      </video>
      */}

      {/* Deep space gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(108,79,240,0.22) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 10% 100%, rgba(0,187,238,0.18) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 90% 80%, rgba(0,212,106,0.12) 0%, transparent 60%), #030508"
        }}
      />

      {/* Floating color orbs */}
      <div className="absolute left-[10%] top-[20%] h-72 w-72 rounded-full bg-axon-violet/30 blur-3xl animate-float-slow" />
      <div
        className="absolute right-[15%] top-[60%] h-80 w-80 rounded-full bg-axon-cyan/25 blur-3xl animate-float-slow"
        style={{ animationDelay: "-3s" }}
      />
      <div
        className="absolute left-[50%] top-[80%] h-64 w-64 rounded-full bg-axon-green/20 blur-3xl animate-float-slow"
        style={{ animationDelay: "-6s" }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(174,155,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(174,155,255,0.4) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 50%, black 30%, transparent 80%)"
        }}
      />

      {/* Scanline / noise */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>\")"
        }}
      />
    </div>
  )
}
