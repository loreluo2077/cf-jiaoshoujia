# 项目 Agent 开发规范

## 项目方向

- 本项目是一个可复用的个人 Cloudflare 全栈应用脚手架。
- 后续功能应在现有架构内扩展，不要引入平行框架或重复的基础设施。
- 改动应保持聚焦和实用，不要增加与当前应用无关的功能或过早抽象。

## 固定技术栈

- 运行与部署：Cloudflare Workers、Cloudflare Vite Plugin 和 Wrangler。
- 后端：Hono，所有应用 API 统一挂载在 `/api` 下。
- 前端：Vite、React 19、TypeScript、HeroUI v3、Tailwind CSS v4 和 Lucide React。
- 数据：Cloudflare D1、Drizzle ORM 和 Drizzle Kit 迁移。
- 测试：Vitest 和 Cloudflare Workers Pool。
- 未经用户明确同意，不得增加同类路由、后端框架、ORM、UI 库、CSS 框架或图标库。

## 项目结构

- `src/client/`：React 应用和前端样式。
- `src/worker/`：Hono Worker、中间件和 API 实现。
- `src/worker/routes/`：路由模块，由 `src/worker/index.ts` 统一挂载。
- `src/worker/auth/`：共享认证逻辑。
- `src/db/`：Drizzle 客户端和数据库 Schema。
- `migrations/`：生成的 D1 数据库迁移。
- Worker 代码必须兼容 Cloudflare 运行时，请求处理流程不得依赖仅限 Node.js 的 API。
- Cloudflare Bindings 必须通过带类型的 `Env` 接口访问，不得隐藏在全局状态中。

## 前端规范

- 只使用 HeroUI v3 API
- 全局 CSS 导入顺序保持为：先 `@import "tailwindcss";`，再 `@import "@heroui/styles";`。
- 优先使用 HeroUI 组合组件、语义化 Variant 和 React Aria 的 `onPress` 事件。
- 常见操作统一使用 Lucide 图标；含义不明确的纯图标控件需要提供 Tooltip。
- 优先使用 HeroUI 基础组件，不要重复实现通用控件。自定义 CSS 主要用于布局、响应式组合和产品特有样式。
- 界面应克制、实用、响应式且便于浏览；避免卡片嵌套、装饰性页面区块和紧凑区域内的超大文字。
- 修改交互流程时，应保留无障碍支持、键盘操作以及加载、空数据和错误状态。

## 后端与数据规范

- 新增 API 时，在 `src/worker/routes/` 下创建职责单一的 Hono 路由模块，并在 `src/worker/index.ts` 中挂载。
- 在 API 边界校验不可信输入，使用合适的 HTTP 状态码，并保持 JSON 响应结构一致。
- 数据库操作统一使用 Drizzle。变更 `src/db/schema.ts` 后生成迁移，检查迁移内容，再通过 Wrangler 执行。
- 不得使用未记录的临时 SQL 直接修改生产数据库结构。

## 认证与密钥

- 保留现有认证方式：TOTP 登录、12 小时签名 Session Cookie、导航 Token 登录和 Bearer `API_TOKEN` 访问。
- 导航 Token 登录成功后，必须从 URL 中移除 Token。
- `LOCAL_AUTH_BYPASS` 仅用于本地开发，并且必须限制在本地主机。
- 密钥只存放在 Wrangler Secrets 或已被忽略的 `.dev.vars` 文件中。不得提交密钥、暴露给前端、不必要地放入 URL 或输出到日志。
- 认证改动在生产环境中必须默认拒绝访问，不得削弱已有 API 保护。

## 变更与验证

- 增加依赖或抽象前，先复用项目已有模式。
- 前端、Worker 和数据库代码必须保持在各自目录边界内。
- 修改 API、认证或数据行为时，应增加或更新针对性测试。
- 环境允许时，完成改动前运行 `npm run build`、`npm test` 和 `npm run check`。
- 修改 UI 后，还需要在桌面端和移动端尺寸下检查相关流程。

## HeroUI 参考资料

- 项目 MCP 配置：`.mcp.json`
- 完整文档：`https://heroui.com/react/llms.txt`
- 组件文档：`https://heroui.com/react/llms-components.txt`
- 设计模式：`https://heroui.com/react/llms-patterns.txt`
