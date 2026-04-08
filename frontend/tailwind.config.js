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
        mint: "#5ac58b",
        coral: "#ef6b73",
        gold: "#d7b15f",
        phosphor: "#ffffff",
        coal: "#000000",
        arcade: "#000000",
        arcade2: "#050505",
        arcade3: "#1f1f1f",
        cyan: "#ededed",
        amber: "#d7b15f",
        pink: "#ededed"
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
