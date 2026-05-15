/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: '#ffffff',
        bg: '#f0f4ff',
        border: '#dbe2f0',
        primary: { DEFAULT: '#3b5bdb', light: '#e8edff', dark: '#2f4ac7' },
        muted: '#55627c',
        healthy: { DEFAULT: '#10b981', bg: '#e8f8ef', text: '#16653d' },
        degraded: { DEFAULT: '#f59e0b', bg: '#fff3df', text: '#7b4a00' },
        critical: { DEFAULT: '#ef4444', bg: '#ffe6e6', text: '#8c1d1d' },
      },
    },
  },
  plugins: [],
}
