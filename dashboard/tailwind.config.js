/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#7B5EA7',
          light: '#9B7EC8',
          dark: '#5C3D9A',
        },
        bg: {
          base: '#0F0D1A',
          card: '#1A1626',
          elevated: '#231D35',
        },
        text: {
          primary: '#F0ECF8',
          secondary: '#B0A0CC',
          muted: '#6B5A8E',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        pulseSoft: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        glow: { '0%': { boxShadow: '0 0 5px #7B5EA7' }, '100%': { boxShadow: '0 0 20px #9B7EC8, 0 0 40px #7B5EA744' } },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
}
