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
        brand: '#02c5c8', // 主色：设计稿青色（选中/星钻/描边/主按钮），与 accent-coin 统一
        'brand-dim': '#02a8ab', // 主色 hover 深一档
        'brand-light': '#87fdff', // 副色：浅青（次级强调 / 链接 / 标签）
        muted: '#8a8a90',
        faint: '#5f5f66',
        // 首页（创作中心）设计稿配色
        canvas: '#050505', // 首页页面背景
        card: '#181a1c', // 项目卡片背景
        accent: '#00d8dc', // 主青色（已完成 / logo）
        'accent-coin': '#02c5c8', // 星钻数值青色（= brand）
        'accent-tag': '#87fdff', // 标签文字青色（= brand-light）
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
