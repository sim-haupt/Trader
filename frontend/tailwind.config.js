/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f4f7fb",
        panel: "#131a27",
        line: "rgba(229,231,235,0.14)",
        mist: "#99a4ba",
        mint: "#38d996",
        coral: "#ff6b72",
        gold: "#f4c85c",
        phosphor: "#f5f7fb",
        coal: "#090d14",
        arcade: "#0f1521",
        arcade2: "#151c2a",
        arcade3: "#1c2536",
        cyan: "#67a8ff",
        amber: "#f4c85c",
        pink: "#8ea8ff"
      },
      boxShadow: {
        glow: "0 32px 90px rgba(0,0,0,0.35)",
        crt: "0 18px 48px rgba(0,0,0,0.24)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
