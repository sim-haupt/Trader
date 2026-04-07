/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#09111f",
        panel: "#111b2d",
        line: "#24324a",
        mist: "#8da0c4",
        mint: "#72f3c6",
        coral: "#ff8e72",
        gold: "#ffd36e"
      },
      boxShadow: {
        glow: "0 18px 60px rgba(10, 16, 29, 0.25)"
      }
    }
  },
  plugins: []
};
