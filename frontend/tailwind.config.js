/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#040706",
        panel: "#0a0f0d",
        line: "#173126",
        mist: "#7ba892",
        mint: "#72f3c6",
        coral: "#5ea389",
        gold: "#d8ffe8",
        phosphor: "#b8ffd9",
        coal: "#030504",
        arcade: "#0a0f0d",
        arcade2: "#07100c",
        arcade3: "#040706",
        cyan: "#8beed0",
        amber: "#9ed9c1",
        pink: "#84c9af"
      },
      boxShadow: {
        glow: "0 18px 60px rgba(0, 0, 0, 0.45)",
        crt: "0 0 0 1px rgba(114, 243, 198, 0.12), inset 0 0 0 1px rgba(114, 243, 198, 0.08), 0 0 30px rgba(114, 243, 198, 0.08)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(114,243,198,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(114,243,198,0.06) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
