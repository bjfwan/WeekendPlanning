/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // 与创意提案 HTML 一致的配色
        coral: {
          DEFAULT: '#FF6B6B',
          dark: '#E85555'
        },
        amber: {
          DEFAULT: '#FFD93D',
          light: '#FFF3C4'
        },
        navy: {
          DEFAULT: '#1A1A2E',
          light: '#2D2D44'
        },
        cream: {
          DEFAULT: '#FFFAF0',
          dark: '#F5E6D3'
        },
        mint: {
          DEFAULT: '#4ECDC4',
          light: '#E0F7F5'
        }
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '-apple-system', 'sans-serif'],
        display: ['"Playfair Display"', '"Noto Sans SC"', 'serif'],
        logo: ['"ZCOOL KuaiLe"', '"Noto Sans SC"', 'cursive']
      },
      boxShadow: {
        card: '0 4px 24px rgba(26,26,46,0.08)',
        hover: '0 12px 40px rgba(26,26,46,0.14)'
      },
      transitionDuration: {
        fast: '150ms',
        normal: '250ms',
        slow: '400ms',
        slower: '600ms'
      },
      transitionTimingFunction: {
        'ease-out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.5s ease-out both',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'check-pop': 'check-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'float-slow': 'float-slow 6s ease-in-out infinite'
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        'check-pop': {
          '0%': { transform: 'scale(0.5)', opacity: '0' },
          '60%': { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)', opacity: '1' }
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' }
        }
      }
    }
  },
  plugins: []
}
