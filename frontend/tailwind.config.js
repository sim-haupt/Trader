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
        arcade3: "oklch(25.45% 0.0811 255.8)",
        cyan: "#7aa2ff",
        amber: "#d7b15f",
        pink: "#7aa2ff"
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
