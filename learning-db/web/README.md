# 阅览网页

学习知识库的只读阅览界面。React + Tailwind v4 + BoardUI，`npm run build` 输出到 `../public`，由 Worker 作为静态资源提供。

- `src/pages/`：令牌、课程列表、课程知识树、知识点详情、待办决策
- `src/lib/api.ts`：`/api/*` 的类型和请求；`src/lib/labels.ts`：中文标签
- `src/components/base`、`application`、`foundations`、`styles`、`utils`：BoardUI 生成的源码（`npx boardui@latest add <name> -d src`）

开发：先在上一级目录 `npm run dev` 启动 Worker，再在这里 `npm run dev`。
