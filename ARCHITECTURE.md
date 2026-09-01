# 个人支付网关 - 架构文档

## 项目概述

这是一个基于 Cloudflare Workers 的个人支付网关系统，作为中间层连接你开发的应用和真实支付渠道。

### 核心价值

- **统一支付接口**：你的应用只需对接一次支付网关，即可支持多种支付方式
- **灵活配置**：可以随时切换或添加支付渠道，无需修改应用代码
- **协议兼容**：支持易支付协议，方便已有应用快速接入
- **回调处理**：统一接收和处理各支付平台的异步通知

## 系统架构

```
你的应用（Sub2Api等）
    ↓ 易支付协议
个人支付网关（本系统）
    ↓ 支付 SDK
真实支付渠道（支付宝/微信支付/Stripe/迅虎支付）
    ↓ 支付回调
回调网关（Callback）
    ↓ 订单状态更新
通知应用
```

### 三层架构

#### 1. 应用层（Apps）
- **定义**：你开发的需要支付功能的应用
- **对接方式**：通过易支付协议与支付网关通信
- **数据表**：`apps`
- **字段**：
  - `id`: 应用唯一标识
  - `code`: 应用代码（如 default-easypay）
  - `name`: 应用名称
  - `protocol`: 协议类型（目前支持 easypay）
  - `pid`: 商户号（易支付协议）
  - `secret`: 密钥（用于签名验证）
  - `enabled`: 是否启用

#### 2. 回调网关层（Callback）
- **职责**：接收支付平台的异步回调通知，处理支付状态变更
- **功能**：
  - 接收并验证支付平台回调
  - 更新订单支付状态
  - 通知应用订单状态变化
  - 处理回调重试逻辑

#### 3. 支付渠道层（Payment Providers）
- **定义**：真实的第三方支付平台
- **支持的渠道**：
  - 支付宝（Alipay）
  - 微信支付（WeChat Pay）
  - Stripe
  - 迅虎支付（Xunhupay）
  - 自定义渠道（Generic）
- **数据表**：`payment_provider_instances`
- **配置**：每个渠道有独立的配置（API Key、密钥等）

## 数据模型

### 核心表结构

#### apps - 应用表
```sql
CREATE TABLE apps (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    protocol TEXT NOT NULL,           -- 协议类型：easypay
    pid TEXT NOT NULL,                -- 商户号
    secret TEXT NOT NULL,             -- 签名密钥
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

#### orders - 订单表
```sql
CREATE TABLE orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount TEXT NOT NULL,
    pay_amount TEXT NOT NULL,
    status TEXT NOT NULL,             -- PENDING/PAID/COMPLETED/FAILED/REFUNDED
    payment_status TEXT NOT NULL,
    delivery_status TEXT NOT NULL,
    payment_type TEXT NOT NULL,       -- alipay/wxpay/stripe等
    provider_instance_id TEXT,        -- 使用的支付渠道ID
    payment_trade_no TEXT,            -- 支付平台订单号
    external_order_no TEXT,           -- 应用侧订单号
    external_notify_url TEXT,         -- 应用回调地址
    app_id TEXT,                      -- 关联的应用ID
    order_type TEXT NOT NULL,         -- balance/easypay_bridge
    refund_amount TEXT,
    refund_reason TEXT,
    refund_at INTEGER,
    -- ... 其他字段
);
```

#### payment_provider_instances - 支付渠道实例表
```sql
CREATE TABLE payment_provider_instances (
    id TEXT PRIMARY KEY,
    provider_key TEXT NOT NULL,       -- alipay/wxpay/stripe/xunhupay/generic
    name TEXT NOT NULL,               -- 渠道名称
    config TEXT NOT NULL,             -- JSON配置
    supported_types TEXT NOT NULL,    -- 支持的支付方式
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL,
    refund_enabled INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

## API 设计

### 应用接入 API（易支付协议）

#### POST /api/app/sub2api/mapi.php
创建支付订单（易支付协议）

**请求参数**：
```
pid: 商户号
type: alipay/wxpay
out_trade_no: 商户订单号
notify_url: 异步回调地址
return_url: 同步跳转地址
name: 商品名称
money: 金额
clientip: 客户端IP
sign: MD5签名
sign_type: MD5
```

**返回格式**：
```json
{
  "code": 1,
  "msg": "success",
  "pid": "商户号",
  "trade_no": "平台订单号",
  "out_trade_no": "商户订单号",
  "type": "alipay",
  "name": "商品名称",
  "money": "1.00",
  "sign": "签名",
  "payurl": "支付链接"
}
```

#### POST /api/app/sub2api/api.php
查询订单或发起退款

**查询订单**：
```
act: order
pid: 商户号
key: 密钥
out_trade_no: 商户订单号
```

**发起退款**：
```
act: refund
pid: 商户号
key: 密钥
out_trade_no: 商户订单号
money: 退款金额
```

### 管理后台 API

#### GET /api/admin/dashboard
获取统计数据

#### GET /api/admin/orders
订单列表（支持分页和筛选）

#### GET /api/admin/providers
支付渠道列表

#### POST /api/admin/providers
创建支付渠道

#### PATCH /api/admin/providers/:id
更新支付渠道

#### DELETE /api/admin/providers/:id
删除支付渠道

#### POST /api/admin/refunds
发起退款

### 回调处理 API

#### POST /api/callback/:providerKey
接收支付平台的支付成功回调

## 支付流程

### 1. 应用发起支付

```
Sub2Api → POST /api/app/sub2api/mapi.php
         ↓
      验证签名
         ↓
      创建订单
         ↓
      选择支付渠道
         ↓
      调用渠道SDK创建支付
         ↓
      返回支付链接给应用
```

### 2. 用户完成支付

```
用户扫码/点击支付
         ↓
   支付平台处理支付
         ↓
POST /api/callback/:providerKey ← 支付平台回调
         ↓
      验证回调签名
         ↓
      更新订单状态为PAID
         ↓
      通知应用（POST external_notify_url）
         ↓
      更新订单状态为COMPLETED
```

### 3. 退款流程

```
应用发起退款请求
         ↓
POST /api/app/sub2api/api.php?act=refund
         ↓
      查找订单
         ↓
      调用支付渠道退款API
         ↓
      更新订单状态为REFUNDED
         ↓
      返回退款结果
```

## 代码结构

```
src/
├── client/                      # React 前端
│   ├── AdminApp.tsx            # 管理后台入口
│   ├── components/             # UI 组件
│   └── pages/                  # 页面组件
│       ├── OrdersPage.tsx      # 订单管理
│       └── ProvidersPage.tsx   # 渠道管理
│
├── worker/                      # Cloudflare Worker 后端
│   ├── index.ts                # Worker 入口
│   ├── routes/                 # 路由
│   │   ├── admin/              # 管理后台路由
│   │   ├── app/                # 应用接入路由
│   │   │   └── sub2api.ts      # Sub2Api 易支付接口
│   │   └── callback/           # 支付回调路由
│   │
│   ├── services/               # 业务逻辑
│   │   ├── admin-service.ts
│   │   ├── easypay-service.ts
│   │   ├── order-service.ts
│   │   ├── refund-service.ts
│   │   └── order-delivery-service.ts
│   │
│   ├── repositories/           # 数据访问层
│   │   ├── app.ts
│   │   ├── order.ts
│   │   └── provider.ts
│   │
│   └── libs/payment/           # 支付渠道SDK
│       ├── providers.ts        # 渠道工厂
│       ├── upstream/           # 上游支付渠道
│       │   ├── alipay.ts
│       │   ├── wxpay.ts
│       │   └── stripe.ts
│       └── downstream/         # 下游协议实现
│           └── easypay.ts
│
├── db/
│   ├── schema.ts               # Drizzle ORM schema
│   └── client.ts
│
└── migrations/                  # 数据库迁移文件
```

## 配置说明

### 环境变量

#### 基础配置
- `PUBLIC_URL`: 网关公网地址（用于生成回调URL）
- `SESSION_SECRET`: 会话密钥
- `API_TOKEN`: API 访问令牌

#### 易支付桥接配置（可选）
- `EASYPAY_BRIDGE_PID`: 默认易支付商户号
- `EASYPAY_BRIDGE_KEY`: 默认易支付密钥

### 支付渠道配置示例

#### 支付宝
```json
{
  "appId": "支付宝应用ID",
  "privateKey": "应用私钥",
  "publicKey": "支付宝公钥"
}
```

#### 微信支付
```json
{
  "appId": "微信应用ID",
  "mchId": "商户号",
  "apiKey": "API密钥"
}
```

#### Stripe
```json
{
  "secretKey": "sk_test_...",
  "publicKey": "pk_test_..."
}
```

#### 迅虎支付
```json
{
  "apiUrl": "https://api.xunhupay.com",
  "appId": "应用ID",
  "appSecret": "应用密钥"
}
```

## 安全设计

### 1. 签名验证
- 应用请求使用 MD5 签名验证身份
- 支付回调验证来源真实性
- 防止请求篡改和重放攻击

### 2. 密钥管理
- 使用 Cloudflare Secrets 存储敏感信息
- 配置存储使用加密字段
- 不在日志中输出敏感数据

### 3. 权限控制
- 管理后台需要 TOTP 认证
- API 访问需要 Bearer Token
- 支持单用户模式

## 部署指南

### 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
npm run auth:setup -- --write-dev-vars

# 应用数据库迁移
npm run db:migrate:local

# 启动开发服务器
npm run dev
```

### 生产部署

```bash
# 构建项目
npm run build

# 配置生产环境密钥
npx wrangler secret put SESSION_SECRET
npx wrangler secret put API_TOKEN
npx wrangler secret put EASYPAY_BRIDGE_PID
npx wrangler secret put EASYPAY_BRIDGE_KEY

# 应用数据库迁移
npm run db:migrate:remote

# 部署到 Cloudflare Workers
npm run deploy
```

## 扩展指南

### 添加新的支付渠道

1. 在 `src/worker/libs/payment/upstream/` 创建渠道实现
2. 实现 `PaymentProvider` 接口
3. 在 `providers.ts` 的 `createPaymentProviders` 中注册
4. 在管理后台添加渠道配置

### 添加新的应用接入协议

1. 在 `src/worker/routes/app/` 创建协议路由
2. 实现协议的请求解析和响应格式
3. 复用 `order-service.ts` 的订单创建逻辑
4. 在 `apps` 表的 `protocol` 字段中添加协议标识

## 监控与运维

### 日志
- 业务日志使用 `business-logger.ts`
- 请求日志包含 requestId 用于追踪
- 关键操作记录在 `audit_logs` 表

### 性能
- 使用 Cloudflare D1 SQLite 数据库
- 全球边缘网络部署，低延迟
- 支持高并发请求

### 故障处理
- 支付失败订单状态为 FAILED
- 回调失败订单状态为 PAID（可重试通知）
- 支持手动重试订单通知

## 常见问题

### Q: 如何测试支付流程？
A: 使用管理后台的"测试支付"功能，或使用支付渠道的沙箱环境。

### Q: 如何切换支付渠道？
A: 在管理后台禁用旧渠道，启用新渠道即可，无需修改应用代码。

### Q: 如何处理退款？
A: 在订单详情中点击退款按钮，或通过易支付协议的 refund 接口发起。

### Q: 支持多应用吗？
A: 支持。在 `apps` 表中创建不同的应用记录，每个应用有独立的 pid 和 secret。

### Q: 如何确保支付安全？
A: 系统使用签名验证、HTTPS 传输、密钥加密存储等多重安全措施。

## 技术栈

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle
- **Frontend**: React + TypeScript
- **UI**: HeroUI v3
- **Build**: Vite
- **Test**: Vitest

## 许可证

Private - 个人项目
