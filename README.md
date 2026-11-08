# fastapp · PhanthyMovie 全自动 AI 视频工作流（前端复刻）

从上传剧本、拆解段落、提取资产、设计镜头到生成视频的完整五步工作流，使用 localStorage 持久化。
本项目只用 mock，不调用真实模型。

## 本地运行
```bash
npm install
npm run dev      # http://localhost:5188/
npm run build    # 产物在 dist/
```

技术栈：Vite + React 18 + TypeScript + Tailwind CSS + Zustand。

## 示例与检查

第一步可载入《两界供应商 · 第一场》。示例重放内置的五个段落及角色、场景和镜头设计；其他剧本使用基础分段 mock。
预置项目完成到镜头设计，三张本地真实照片分别演示 16:9（1600×900）、9:16（900×1600）和 1:1（1200×1200）。参考图生成默认 16:9，支持五种比例，使用本地 SVG 示意图；视频使用模拟封面。

离线回归：`node scripts/check-demo-fixtures.mjs`、`node scripts/check-workflow.mjs`。
其余 `scripts/check-*.mjs` 检查提示词、生成恢复及构建产物。

## 提示词

本地优先读取 `../测试提示词效果/全自动工作流提示词.md`，修改后自动刷新。
公网构建使用仓库内的 `src/data/promptBook.md` 快照，不依赖仓库外的文件。
发布提示词更新时，将原文档同步到该快照后再构建。

## 在线预览

推送到 `main` 会经 GitHub Actions 自动构建并部署到 GitHub Pages：
https://sunnygirl-0106.github.io/fastapp/

## 目录

- `src/steps/` 五步工作流页面
- `src/store/` 状态管理与持久化
- `src/services/` mock 生成、字段校验和提示词拼接
- `server/` 本地提示词热更新
- `src/data/` 示例、参考图占位与提示词快照

## 占位照片来源

预置参考图为 Pexels 照片按目标尺寸导出的本地文件，仅用于展示比例，不代表剧本人物或场景：

- 横图：[Simon Robben · Man in Brown Polo Shirt](https://www.pexels.com/photo/man-in-brown-polo-shirt-614810/)
- 竖图：[Pixabay · Woman Wearing Black Spaghetti Strap Top](https://www.pexels.com/photo/woman-wearing-black-spaghetti-strap-top-415829/)
- 方图：[Pexels · 室内场景](https://www.pexels.com/photo/1643383/)
