# fastapp · PhanthyMovie 全自动 AI 视频工作流（前端复刻）

从「上传剧本 → 分段 → 资产 → 分镜 → 分段生成视频」的完整 5 步工作流前端复刻，
以截图为功能基线，叠加安全的交互/文案优化。纯前端 mock（无后端），localStorage 持久化。

## 技术栈
Vite + React 18 + TypeScript + Tailwind CSS + Zustand。

## 本地运行
```bash
npm install
npm run dev      # http://localhost:5188/
npm run build    # 产物在 dist/
```

## 在线预览
推送到 `main` 会经 GitHub Actions 自动构建并部署到 GitHub Pages：
https://sunnygirl-0106.github.io/fastapp/

## 目录
- `src/steps/` 5 步页面（剧本/分段/资产/分镜/视频）
- `src/store/` Zustand 状态 + localStorage 持久化
- `src/services/` mock 生成/计费（唯一替换点，日后可接真实 API）
- `src/data/` 内置示例《最后的外卖》
