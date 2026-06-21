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
        display: ['"Playfair Display"', '"Noto Sans SC"', 'serif']
      },
      boxShadow: {
        card: '0 4px 24px rgba(26,26,46,0.08)',
        hover: '0 12px 40px rgba(26,26,46,0.14)'
      }
    }
  },
  plugins: []
}
