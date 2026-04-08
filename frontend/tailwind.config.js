/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#ededed",
        panel: "#000000",
        line: "rgb(31,31,31)",
        mist: "#ffffff9c",
        mint: "oklch(71.7% 0.1648 250.794)",
        coral: "oklch(71.7% 0.1648 250.794)",
        gold: "oklch(71.7% 0.1648 250.794)",
        phosphor: "#ffffff",
        coal: "#000000",
        arcade: "#000000",
        arcade2: "#050505",
        arcade3: "oklch(25.45% 0.0811 255.8)",
        cyan: "oklch(71.7% 0.1648 250.794)",
        amber: "oklch(71.7% 0.1648 250.794)",
        pink: "oklch(71.7% 0.1648 250.794)"
      },
      boxShadow: {
        glow: "none",
        crt: "none"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
