/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#fafafa",
        panel: "#111318",
        line: "rgba(255,255,255,0.08)",
        mist: "#a1a1aa",
        mint: "#5ac58b",
        coral: "#ef6b73",
        gold: "#d7b15f",
        phosphor: "#f4f4f5",
        coal: "#0a0b0d",
        arcade: "#0f1115",
        arcade2: "#13161b",
        arcade3: "#191d24",
        cyan: "#7c9cff",
        amber: "#d7b15f",
        pink: "#a4bcff"
      },
      boxShadow: {
        glow: "0 24px 72px rgba(0,0,0,0.32)",
        crt: "0 14px 42px rgba(0,0,0,0.24)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
