/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#0b1220',
        slate: '#3c4861',
        haze: '#e7ecf5',
        sand: '#f6f4ee',
        ocean: '#1f7a8c',
        ember: '#e07a5f',
        moss: '#2f7d62',
      },
      boxShadow: {
        glow: '0 18px 40px rgba(31, 122, 140, 0.18)',
      },
    },
  },
  plugins: [],
}
