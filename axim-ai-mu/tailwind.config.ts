import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        axon: {
          violet: "#6C4FF0",
          violetLight: "#8B6FF4",
          violetPale: "#AE9BFF",
          cyan: "#00BBEE",
          cyanLight: "#40D4FF",
          green: "#00D46A",
          greenLight: "#3FFFAA",
          amber: "#EF9F27",
          rose: "#FF4D6D",
          ink: "#030508",
          ink2: "#070A12",
          ink3: "#0A0F1C",
          ink4: "#0D1220",
          txt: "#D8E4FF",
          txt2: "#6677AA",
          txt3: "#2A3550"
        }
      },
      fontFamily: {
        display: ["Syne", "ui-sans-serif", "system-ui"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"]
      },
      backgroundImage: {
        "axon-grad":
          "linear-gradient(90deg,#8B6FF4 0%,#00BBEE 50%,#00D46A 100%)",
        "axon-radial":
          "radial-gradient(ellipse at top, rgba(108,79,240,0.18), transparent 60%), radial-gradient(ellipse at bottom, rgba(0,187,238,0.12), transparent 60%)"
      },
      animation: {
        "gradient-x": "gradient-x 6s linear infinite",
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite",
        "float-slow": "float-slow 8s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite"
      },
      keyframes: {
        "gradient-x": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" }
        },
        "pulse-soft": {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.4)" }
        },
        "float-slow": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      }
    }
  },
  plugins: []
}

export default config
