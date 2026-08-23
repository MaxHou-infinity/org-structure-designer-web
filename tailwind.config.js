/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        soft: '0 2px 15px -3px rgba(0,0,0,.07), 0 10px 20px -2px rgba(0,0,0,.04)',
        card: '0 1px 3px rgba(0,0,0,.06), 0 8px 24px rgba(99,102,241,.08)',
        tint: '0 12px 30px rgba(99,102,241,.12)',
      },
      keyframes: {
        slideInRight: { from: { transform: 'translateX(100%)', opacity: 0 }, to: { transform: 'translateX(0)', opacity: 1 } },
        slideInUp: { from: { transform: 'translateY(24px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
      },
      animation: {
        slideInRight: 'slideInRight 0.24s ease-out',
        slideInUp: 'slideInUp 0.3s cubic-bezier(0.4,0,0.2,1)',
      },
    },
  },
  plugins: [],
}
