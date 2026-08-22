# UI 开发规范

项目统一使用 HeroUI v3 作为 React 组件库，并使用 Tailwind CSS v4 处理 HeroUI 的样式构建。当前版本基于 React 19，不需要在应用根节点增加 `HeroUIProvider`。

## 基础配置

Vite 插件顺序保持为 React、Tailwind CSS、Cloudflare：

```ts
plugins: [react(), tailwindcss(), cloudflare()]
```

全局样式入口 `src/client/styles.css` 必须先引入 Tailwind CSS，再引入 HeroUI：

```css
@import "tailwindcss";
@import "@heroui/styles";
```

项目根目录的 `.mcp.json` 配置了 `@heroui/react-mcp`。实现新组件前，优先通过 MCP 或 `https://heroui.com/react/llms.txt` 获取当前 v3 文档，不依赖旧版 API 记忆。

组件从 `@heroui/react` 导入。优先只导入当前文件实际使用的组件：

```tsx
import { Button, Input } from '@heroui/react';
```

## 组件边界

- 按钮、输入框、选择器、菜单、弹窗、提示、分页和数据展示优先使用 HeroUI。
- 页面布局、响应式网格、品牌色和业务专用组合使用项目 CSS。
- 不重复封装只有改名作用的基础组件。多个页面出现相同交互或业务规则时，再提取项目组件。
- 使用 HeroUI v3 的 compound components API，例如 `InputOTP.Group` 和 `InputOTP.Slot`。
- 新页面不要混用另一套组件库；确有缺失组件时，先记录缺口和选型原因。

## 视觉约定

- 工作台界面保持克制、紧凑、便于扫描，避免营销页式的大面积装饰。
- 普通卡片圆角不超过 8px，页面区块不套用浮动卡片，卡片内不再嵌套卡片。
- 颜色、间距和状态优先复用 HeroUI token；项目 CSS 只覆盖明确的产品视觉需求。
- 图标按钮优先使用统一图标库并提供可访问名称，不手写内联 SVG 图标。
- 所有固定格式控件都要定义稳定尺寸和响应式约束，避免加载或状态变化引发布局跳动。

## 交互和可访问性

- 使用 `isDisabled`、`isInvalid`、`onPress` 等 HeroUI / React Aria 属性表达组件状态。
- 表单错误需要可读文案，并使用 `role="alert"` 或组件提供的错误槽位通知辅助技术。
- 异步操作必须有执行中和失败状态；提交中禁用重复操作。
- 键盘焦点、表单标签和移动端触控区域不得因自定义样式被移除。

## 验证要求

UI 变更至少执行：

```bash
npm run build
npm run test
```

涉及布局或交互时，还要分别检查桌面和移动端视口，确认无内容溢出、遮挡和不可操作状态。
