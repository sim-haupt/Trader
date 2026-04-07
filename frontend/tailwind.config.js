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
        coral: "#76c8a8",
        gold: "#baf7de",
        phosphor: "#b8ffd9",
        coal: "#030504"
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
