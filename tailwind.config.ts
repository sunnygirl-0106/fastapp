import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 与截图一致的暗色主题
        ink: '#0a0a0b', // 页面背景
        panel: '#141416', // 卡片/面板
        panel2: '#1c1c1f', // 次级面板/输入
        line: '#2a2a2e', // 分隔线
        brand: '#33e1d2', // 品牌青
        'brand-dim': '#2bbcb0',
        muted: '#8a8a90',
        faint: '#5f5f66',
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        spin: { to: { transform: 'rotate(360deg)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        fadeUp: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        slideInRight: { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        spin: 'spin 0.8s linear infinite',
        fadeUp: 'fadeUp 0.2s ease-out',
        slideInRight: 'slideInRight 0.22s ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config
