# 项目 Agent 开发规范

## 项目方向

- 本项目是一个可复用的个人 Cloudflare 全栈应用脚手架。
- 后续功能应在现有架构内扩展，不要引入平行框架或重复的基础设施。
- 改动应保持聚焦和实用，不要增加与当前应用无关的功能或过早抽象。

## 固定技术栈

- 运行与部署：Cloudflare Workers、Cloudflare Vite Plugin 和 Wrangler。
- 后端：Hono，所有应用 API 统一挂载在 `/api` 下。
- 前端：Vite、React 19、TypeScript、shadcn/ui 风格本地组件、Tailwind CSS v4 和 Lucide React。
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

- UI 组件统一使用 `src/client/components/ui/` 中的 shadcn/ui 风格本地组件；新增通用组件前先复用已有组件。
- 不再引入或使用 HeroUI、React Aria Components 或其他平行 UI 组件库，除非用户明确同意。
- 使用 Tailwind CSS v4 的 CSS-first 配置；全局样式必须先导入 `@import "tailwindcss";`，主题变量集中维护在 `src/client/styles.css`。
- 使用 `cn`（`src/client/lib/utils.ts`）合并 class；组件变体优先使用语义化的 `variant`，避免在业务页面重复实现基础样式。
- 常见操作统一使用 Lucide 图标；含义不明确的纯图标控件需要提供 `aria-label` 或 Tooltip。
- 使用标准 React 事件（如 `onClick`、`onChange`），并为表单、按钮、表格和进度控件保留正确的原生语义和 ARIA 属性。
- 界面应克制、实用、响应式且便于浏览；避免卡片嵌套、装饰性页面区块和紧凑区域内的超大文字。
- 修改交互流程时，应保留无障碍支持、键盘操作以及加载、空数据和错误状态。

## Hono 后端规范

### 三层职责与 Controller 规范

- **Controller 层**位于 `src/worker/routes/`，只负责读取 HTTP 请求、校验和规范化输入，以及记录脱敏后的请求/响应日志。
- Controller 将已校验的 DTO 传给 Service；不得在 Controller 中执行数据库查询、认证算法、业务状态计算、时间计算或业务流程编排。
- Controller 中保留 Hono 必需的响应出口（JSON、重定向和 HTTP 状态码映射），除此之外不承载业务逻辑。
- **Service 层**位于 `src/worker/services/`，只负责业务用例、领域规则和流程编排，不依赖 Hono Context，不打印 HTTP 入参/出参日志。
- **Repository/Adapter 层**负责 Drizzle/D1、Cookie、TOTP、Token 比较等外部资源和基础设施，不处理 HTTP 参数和状态码。
- 每个请求按需创建请求级 Repository/Adapter；禁止全局单例、全局可变状态和隐藏 binding。
- Controller 日志统一使用简单格式 `[xxx][入参]:yyyy` 和 `[xxx][出参]:yyyy`，例如 `log('SettingsController', '入参', requestId, { keyPresent: true })`。
- 所有请求必须先经过 Hono `requestId()`，再经过 Hono `logger()`；Controller 通过 Context 读取 requestId，日志和响应头使用同一个 `X-Request-ID`，业务代码不得自行生成或重复实现通用请求日志。
- 日志只记录摘要；TOTP、Session Cookie、Bearer Token、Navigation Token、Secrets、完整请求 Body 和数据库敏感值禁止原样打印，只能记录存在性、长度、错误代码或 `[REDACTED]`。

### 运行时与类型

- Worker 后端统一使用 Hono，不得引入 Express、Fastify、Koa 或其他平行 Web 框架。
- 所有 Worker 代码必须兼容 Cloudflare Workers Web APIs；请求处理流程不得依赖仅 Node.js 可用的 API。
- Cloudflare bindings 必须通过显式类型访问，例如 `new Hono<{ Bindings: Env }>()`。
- 不得把 `Env`、D1、Secrets 或其他 binding 放入全局变量、模块级单例或隐藏状态。
- 请求级数据使用 Hono Context 或类型化的 `c.set()` / `c.get()` 传递，不使用全局可变状态。

### 应用入口与路由

- `src/worker/index.ts` 是唯一的 Hono 应用组装入口。
- 业务路由必须放在 `src/worker/routes/`，每个模块只负责一个业务边界，并由入口使用 `app.route()` 统一挂载。
- 所有业务 API 必须挂载在 `/api` 下；路由前缀由入口负责，路由模块内部不得重复拼接完整路径。
- 路由注册顺序保持为：通用中间件、认证/权限中间件、业务路由、`notFound`、`onError`。
- 不在路由处理器中动态注册路由，也不在单个入口文件中堆积所有业务处理逻辑。

### Context 与中间件

- 使用 `c.req` 读取请求，使用 `c.env` 访问 Cloudflare bindings，使用 `c.var` 访问中间件注入的数据。
- 只在确有跨中间件传递需求时使用 `c.set()` / `c.get()`，并为 Context Variables 定义显式类型。
- 中间件必须职责单一，并明确是否会终止请求；终止请求时必须返回响应。
- 认证、权限、CORS、请求 ID 和安全头等中间件按依赖顺序注册。
- 不在中间件中执行与所有请求无关的数据库查询。

### 输入校验

- URL 参数、Query、Headers、Cookie 和 Request Body 都视为不可信输入，必须在 API 边界校验。
- 优先使用 Hono Validator 与项目统一选定的 schema 校验库；不得让每个路由采用不同的校验方案。
- 校验失败统一返回 `400` 或 `422`，并使用稳定的 JSON 结构：`{ error: 'VALIDATION_ERROR', message: '请求参数无效', details: {} }`。
- 不得把未经校验的对象直接传给 Drizzle、D1 或认证逻辑；必须明确限制字段类型、长度、枚举值和空值。

### 响应与错误处理

- 成功响应使用明确且稳定的 JSON 对象结构；新增接口必须同步更新前端调用方和测试。
- 错误响应统一包含机器可读的 `error` 字段，必要时包含用户可读的 `message`；不得向客户端返回堆栈、密钥、binding 名称或数据库错误细节。
- 使用正确的 HTTP 状态码：`200` 读取/更新成功，`201` 创建成功，`204` 无响应体成功，`400`/`422` 输入无效，`401` 未认证，`403` 无权限，`404` 不存在，`409` 冲突，`500` 未预期错误。
- 应在应用入口配置统一的 `app.onError()` 和 `app.notFound()`；可预期业务失败使用统一异常，不用异常代替正常分支。
- HTTP 边界错误使用 Hono `HTTPException`；业务规则错误使用不依赖 Hono 的 `BusinessException`；未预期错误统一由 `app.onError()` 转为安全的 500 响应。
- 日志中不得输出 TOTP、Session、API token、Secrets 或完整请求 Body。

### 认证与安全

- 认证逻辑统一放在 `src/worker/auth/`，业务路由不得复制认证实现。
- 认证中间件默认拒绝访问；本地绕过必须限制在 localhost，并由显式环境变量启用。
- Session Cookie、Bearer Token、TOTP 和导航 Token 遵守现有认证约定；导航 Token 交换成功后必须从 URL 中移除。
- Cookie 必须根据环境设置 `HttpOnly`、`Secure`、`SameSite` 和合理的 `Path` / `Max-Age`。
- CORS 不得默认允许任意来源；需要放宽时必须明确允许的 Origin、Methods 和 Headers。

### 数据库与测试

- 路由层负责 HTTP 输入输出，数据库访问统一使用 Drizzle；不在路由中拼接 SQL 或执行未记录的 schema 修改。
- D1、R2、KV 等 binding 必须从 `c.env` 或显式传入的依赖访问；数据库错误不得原样暴露给客户端。
- 每个新增或修改的 API 至少覆盖正常成功、未认证、输入校验失败、空结果/不存在和适用的数据库失败路径。
- 使用 Vitest 和 Cloudflare Workers Pool 测试真实的 Hono `app.request()` 行为，断言状态码、JSON 结构、Cookie/Header 和关键副作用。
- 修改认证、中间件或公共错误处理时，必须运行完整 API 测试集。

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
- 提交前运行 `npm run format:check`；需要自动格式化时运行 `npm run format`。
- 环境允许时，完成改动前运行 `npm run build`、`npm test` 和 `npm run check`。
- 修改 UI 后，还需要在桌面端和移动端尺寸下检查相关流程。

## UI 与 Hono 参考资料

- shadcn/ui 官方文档：`https://ui.shadcn.com/`
- shadcn/ui 配置文件：`components.json`
- Hono 官方文档索引：`https://hono.dev/llms.txt`
- Hono 完整文档：`https://hono.dev/llms-full.txt`
- Hono 最佳实践：`https://hono.dev/docs/guides/best-practices`
- Hono 验证指南：`https://hono.dev/docs/guides/validation`
- Hono 中间件指南：`https://hono.dev/docs/guides/middleware`
- Hono Request ID：`https://hono.dev/docs/middleware/builtin/request-id`
- Hono Logger：`https://hono.dev/docs/middleware/builtin/logger`
- Hono 测试指南：`https://hono.dev/docs/guides/testing`
- Hono Cloudflare Workers：`https://hono.dev/docs/getting-started/cloudflare-workers`
