/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        craft: {
          bg: '#FAF9F6',
          canvas: '#F8FAFC',
          card: '#FFFFFF',
          text: '#0F172A',
          muted: '#64748B',
          border: '#E2E8F0',
          primary: '#4F46E5', // Indigo-violet
          primaryHover: '#4338CA',
          accent: '#EC4899', // Berry pink
          mint: '#10B981',
          cream: '#FFFBEB',
          lavender: '#EEF2FF',
          amber: '#F59E0B'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(15, 23, 42, 0.05)',
        glow: '0 0 25px -5px rgba(79, 70, 229, 0.15)',
        craft: '0 10px 30px -5px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.025)'
      }
    },
  },
  plugins: [],
}
