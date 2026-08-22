# Jiaoshoujia Application Scaffold

统一的 Cloudflare 全栈应用脚手架，当前约定为 Cloudflare Workers + Vite plugin、Hono、React、D1 + Drizzle ORM，以及 Vitest Cloudflare pool。

## 快速开始

```bash
npm install
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。常用命令：

```bash
npm run build              # 类型检查并构建
npm run check              # 构建 + Wrangler dry-run
npm run test               # Worker API 测试
npm run cf-typegen         # 根据 wrangler 配置生成 Env 类型
npm run db:generate        # 根据 schema 生成 D1 migration
npm run db:migrate:local   # 应用本地 D1 migration
npm run auth:setup         # 生成 TOTP 二维码和认证 Secret
npm run deploy             # 构建并部署到 Workers
```

本地数据库验证接口：`GET /api/settings`、`GET /api/settings?key=database-demo` 和 `PUT /api/settings/database-demo`。写入请求格式为 `{ "value": "..." }`。

## 目录约定

```text
src/
  client/                  React 应用和浏览器样式
  worker/                  Hono Worker 入口和 API 路由
  db/                      Drizzle schema、数据库客户端
migrations/                Drizzle 生成的 D1 SQL migrations
vite.config.ts             React + Cloudflare Vite plugin
wrangler.jsonc             Worker、Assets 和 Cloudflare bindings
drizzle.config.ts          Drizzle Kit 配置
```

API 统一放在 `/api` 下。新增业务服务时，在 `src/worker/routes` 增加路由模块，再由 `src/worker/index.ts` 挂载。

## D1 配置

当前配置使用一个本地专用的占位 database id，`wrangler dev` 和 `npm run db:migrate:local` 只操作本地 D1。连接真实 Cloudflare D1 时，替换 `database_id` 和 `database_name`，确认无 `remote` 后先执行 `npm run cf-typegen`、`npm run db:generate` 和本地迁移；明确需要线上数据时才使用 `npm run db:migrate:remote`。

生产环境迁移使用 `npm run db:migrate:remote`，敏感信息使用 Wrangler secrets，不提交到仓库。

## 认证初始化

认证是单用户模式，支持三种登录方式：

- 浏览器输入身份验证器生成的 6 位 TOTP。
- 导航网站访问 `/auth/callback?token=...`，登录后 URL 会被重定向清理。
- 程序调用 API 时使用 `Authorization: Bearer <API_TOKEN>`。

首次初始化在本地执行：

```bash
npm run auth:setup
```

命令会生成新的 `TOTP_SECRET`、`SESSION_SECRET`、`NAVIGATION_TOKEN` 和 `API_TOKEN`，并在终端显示 TOTP 二维码。使用验证器扫描二维码后，把终端输出的同一组值分别配置到 Cloudflare：

```bash
npx wrangler secret put TOTP_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put NAVIGATION_TOKEN
npx wrangler secret put API_TOKEN
```

本地开发可以让命令直接创建 `.dev.vars`：

```bash
npm run auth:setup -- --write-dev-vars
```

如果 `.dev.vars` 已存在，命令默认不会覆盖；明确需要重新生成时使用 `--force`。真实 Secret 不要提交到 Git、截图或聊天记录。重新生成 `TOTP_SECRET` 后，需要在验证器中重新扫描二维码；重新生成其他 Token 会让旧会话或旧 API 调用失效。

部署到线上后，Secret 会保留在 Cloudflare Worker 上，普通 `npm run deploy` 不会清除它们。不同 Worker 或 Wrangler environment 需要分别设置。

## 迁移范围

当前工作区的迁移盘点和分阶段策略见 [MIGRATION.md](./MIGRATION.md)。源项目保持独立仓库，迁移按 API 合约、资源绑定、数据迁移、前端路由四个边界逐步进行。
