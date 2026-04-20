/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'lmu-primary': '#1a1a2e',
        'lmu-secondary': '#16213e',
        'lmu-accent': '#facc15',
        'lmu-highlight': '#0f3460',
      },
    },
  },
  plugins: [],
}
