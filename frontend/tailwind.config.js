/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f4f7fb",
        panel: "#10131a",
        line: "rgba(255,255,255,0.08)",
        mist: "#a0a8b8",
        mint: "#19c37d",
        coral: "#ff5d6c",
        gold: "#f6c453",
        phosphor: "#f4f7fb",
        coal: "#0b0d12",
        arcade: "#12161d",
        arcade2: "#171b24",
        arcade3: "#1e2430",
        cyan: "#63a7ff",
        amber: "#f6c453",
        pink: "#8b7cff"
      },
      boxShadow: {
        glow: "0 24px 80px rgba(0,0,0,0.42)",
        crt: "0 24px 80px rgba(0,0,0,0.42)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
