/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15171b",
        panel: "#f3f4f7",
        line: "#d7dbe3",
        mist: "#6e7585",
        mint: "#18a36b",
        coral: "#ff6b6b",
        gold: "#ffffff",
        phosphor: "#252933",
        coal: "#eef1f6",
        arcade: "#ffffff",
        arcade2: "#f7f8fb",
        arcade3: "#e8ebf1",
        cyan: "#6b7dff",
        amber: "#ffb84d",
        pink: "#8c6cff"
      },
      boxShadow: {
        glow: "0 18px 60px rgba(18, 27, 45, 0.08)",
        crt: "0 0 0 1px rgba(107, 125, 255, 0.14), inset 0 0 0 1px rgba(255,255,255,0.55), 0 10px 30px rgba(107, 125, 255, 0.1)"
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(107,125,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(107,125,255,0.06) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};
