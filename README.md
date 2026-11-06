# fastapp · PhanthyMovie 全自动 AI 视频工作流（前端复刻）

从「上传剧本 → 分段 → 资产 → 分镜 → 分段生成视频」的完整 5 步工作流前端复刻，
以截图为功能基线，叠加交互/文案优化。公网为纯前端模拟模式，localStorage 持久化；本地开发可通过服务端代理调用真实文本模型。

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

生产构建始终使用模拟拆解、资产提取与镜头生成，不调用真实模型、不消耗 API 额度。
发布流程检查产物中没有密钥和真实模型请求入口。

## 本地密钥与提示词

真实模型密钥只保存在被 Git 忽略的 `.env.local` 中，使用 `OPENROUTER_API_KEY` 配置。
不要为密钥添加 `VITE_` 前缀。`.env*`、`.usage/` 账单与归档不会提交或部署。
`PHANTHY_MOCK=1` 可强制本地使用模拟模式；调用真实模型时需取消该环境变量。

本地优先读取 `../测试提示词效果/全自动工作流提示词.md`，修改后自动刷新。
公网构建使用仓库内的 `src/data/promptBook.md` 快照，不依赖仓库外的文件。
发布提示词更新时，将原文档同步到该快照后再构建。

## 目录
- `src/steps/` 5 步页面（剧本/分段/资产/分镜/视频）
- `src/store/` Zustand 状态 + localStorage 持久化
- `src/services/` 模拟生成、文本模型客户端与提示词解析
- `server/` 仅本地开发使用的模型代理和预算控制
- `src/data/` 内置示例《最后的外卖》
