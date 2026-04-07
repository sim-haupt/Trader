/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#040706",
        panel: "#0d0914",
        line: "#2b1f3c",
        mist: "#a39ab8",
        mint: "#8a67ff",
        coral: "#c786ff",
        gold: "#e5dcff",
        phosphor: "#f0eaff",
        coal: "#030504",
        arcade: "#130d1d",
        arcade2: "#1a1226",
        arcade3: "#09070f",
        cyan: "#b59cff",
        amber: "#d9c8ff",
        pink: "#9d7cff"
      },
      boxShadow: {
        glow: "0 18px 60px rgba(0, 0, 0, 0.45)",
        crt: "0 0 0 1px rgba(138, 103, 255, 0.16), inset 0 0 0 1px rgba(138, 103, 255, 0.1), 0 0 34px rgba(138, 103, 255, 0.12)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(138,103,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(138,103,255,0.08) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
