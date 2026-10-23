# CallFlow AI Phone Assistant

[English](README.en.md) | 简体中文

> 本地优先的电话预约运营工作台：React + TypeScript + Express + SQLite。
> 来电、STT、AI 与飞书通过**显式模拟适配器**演示；真实外部服务未接入，界面与 API 都会如实标注。

![CallFlow 运营概览](docs/screenshots/dashboard.png)

## 这是什么

CallFlow 是一个可本地运行、可实际操作、可测试的预约管理工作台，面向餐厅、门店或预约制服务场景。它把“来电 → 客户识别 → 接听 → 模拟转写 → 模拟 AI 提取 → 创建预约 → 更新客户档案”串成一条完整链路，同时提供预约、桌台、客户、散客、报表、通知与系统管理。

它适合用来阅读代码、学习一个完整的前后端项目，或作为本地演示。它**不是**生产级呼叫中心，也**没有**接入真实电话网络、真实语音识别、真实大模型或真实飞书 API。

## 核心特性

- **预约与日历**：六种状态、状态机校验、可配置冲突窗口（默认 90 分钟，可调 15–240 分钟）、附近时段推荐、桌台容量与组合包间校验。
- **桌台与资源**：区域、桌台、组合包间、营业时段；按日期查看占用与座位图。
- **客户与散客**：客户档案、等级、偏好、过敏、标签、消费记录、合并；散客登记、入座、取消与转预约。
- **来电与模拟 AI**：模拟来电、客户识别、接听/挂断、模拟转写、摘要、标签、关键词、预约字段提取、情绪与话术建议。
- **运营与报表**：今日指标、到店节奏、来源分布、KPI、趋势、导出、通知中心。
- **系统管理**：服务端会话、四级 RBAC、CSRF 请求头、审计日志、敏感配置掩码、数据导入导出、备份与恢复。

## 真实 / 模拟边界

| 能力 | 当前状态 | 说明 |
| --- | --- | --- |
| 模拟来电、客户识别、接听、挂断 | 模拟可用 | 不拨号、不连接电话网络、不采集麦克风 |
| 模拟 STT 转写与说话人分段 | 模拟可用 | 由 mock 适配器生成，响应带 `simulated: true` |
| 模拟 AI 摘要 / 标签 / 关键词 / 提取 / 情绪 / 画像 / 话术 | 模拟可用 | 规则与模板生成，不调用真实大模型 |
| 模拟 Webhook 测试投递 | 模拟可用 | 只写投递记录，明确标注“未发起网络请求” |
| 模拟飞书连接测试与同步任务 | 模拟可用 | 不调用真实飞书 API |
| 真实 CTI / ADB 电话设备与 SIP 中继 | 未实现 | 设置页可选 `mock / adb / cti`，但均不连接真实设备 |
| 真实录音、回放与下载 | 未实现 | 模拟通话没有音频文件 |
| 真实流式 STT | 未实现 | 无真实音频输入 |
| 真实 LLM 服务 | 未实现 | 无真实模型调用 |
| 真实 Webhook 自动事件投递 | 未实现 | 当前只有强制模拟的测试入口 |
| 真实飞书 API 同步 | 未实现 | 适配器只返回模拟结果 |

服务端状态接口会返回 `realReady: false` 与未实现原因；所有模拟链路在界面上都有“模拟”“无真实音频”“不会发起真实网络请求”等提示。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript（strict）、Vite 6、React Router 7、lucide-react、date-fns |
| 后端 | Node.js >= 22.5、Express 5、Zod |
| 数据库 | Node 内置 `node:sqlite`，WAL、外键、事务、参数化 SQL |
| 认证与安全 | scrypt 密码哈希、HttpOnly Cookie 会话、RBAC、CSRF 请求头、审计日志 |
| 测试 | Node Test Runner（API 集成）、Playwright-core + Microsoft Edge（UI 冒烟） |

## 快速开始

环境要求：**Node.js >= 22.5.0**（使用内置 `node:sqlite`）与 npm 10+。

```bash
npm ci

# 开发模式：API + Vite，前端热更新
npm run dev
# API:  http://127.0.0.1:8788
# Web:  http://127.0.0.1:5174

# 生产式本地运行
npm run build
npm start
# http://127.0.0.1:8788
```

首次启动会自动建库并写入虚构演示数据。数据库默认位于 `data/callflow-full.db`，可通过 `.env` 覆盖（参考 `.env.example`）。`.env`、数据库、日志与备份均已被 `.gitignore` 排除。

### 演示账号

| 角色 | 用户名 | 密码 | 权限概要 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `CallFlowDemo!2026` | 全部权限，含用户、审计、数据与覆盖冲突 |
| 经理 | `manager` | `CallFlowManager!2026` | 业务管理、删除、数据导入导出与备份 |
| 客服 | `agent` | `CallFlowAgent!2026` | 日常预约、客户、通话与散客操作 |
| 只读 | `viewer` | `CallFlowViewer!2026` | 只读查看，不能修改业务数据 |

密码可通过 `DEMO_ADMIN_PASSWORD` 等环境变量覆盖。**在任何非本地环境使用前必须修改。**

## 界面预览

| 运营概览 | 预约日历 |
| --- | --- |
| ![运营概览](docs/screenshots/dashboard.png) | ![预约日历](docs/screenshots/calendar.png) |

| 预约管理 | 来电中心 |
| --- | --- |
| ![预约管理](docs/screenshots/appointments.png) | ![来电中心](docs/screenshots/calls.png) |

| 客户档案 | 散客候位 |
| --- | --- |
| ![客户档案](docs/screenshots/customers.png) | ![散客候位](docs/screenshots/walk-ins.png) |

| 模拟通话链路 | 桌台布局 |
| --- | --- |
| ![模拟通话](docs/screenshots/call-simulation.png) | ![桌台布局](docs/screenshots/tables.png) |

| 运营报表 | 系统设置 |
| --- | --- |
| ![运营报表](docs/screenshots/reports.png) | ![系统设置](docs/screenshots/settings.png) |

移动端与平板预览见 `docs/screenshots/mobile-dashboard.png` 与 `docs/screenshots/tablet-appointments.png`。所有截图均使用虚构演示数据。

## 项目结构

```text
callflow-ai-phone-assistant/
├── src/                    React 19 + TypeScript 前端
│   ├── pages/              14 个工作区页面
│   ├── components/         导航、弹窗、表格、状态、Toast 等
│   ├── api.ts              统一 API 客户端（含 CSRF 头与 401 处理）
│   ├── auth.tsx            会话与权限上下文
│   └── styles.css          设计系统与响应式样式
├── server/
│   ├── app.js              Express 装配、静态文件、错误处理
│   ├── auth.js             scrypt、session、RBAC、审计
│   ├── db.js               SQLite schema
│   ├── seed.js             完全虚构的演示数据
│   ├── domain/             预约、通话、客户、散客、报表、数据、设置
│   ├── routes/             REST API 路由
│   └── adapters/           telephony / ai / feishu / webhook
├── tests/server.test.js    API 集成测试
├── scripts/                UI smoke 与截图脚本
├── docs/                   架构、开发、安全、功能矩阵、测试与截图
└── data/                   本地 SQLite 数据（运行时生成，不提交）
```

- 前后端同源部署：`npm start` 由 Express 提供 `dist/` 与 `/api`。
- 开发模式：Vite 在 `5174` 启动，并将 `/api` 代理到 `8788`。
- 数据层：`node:sqlite`，开启 WAL 与外键，写操作使用参数化 SQL。
- 权限：服务端路由级权限守卫；前端导航与页面只做展示层限制。

更多设计细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 测试与验证

```bash
npm run build          # TypeScript 严格模式 + Vite 构建
NODE_ENV=test npm test # API 集成测试（26 项）
npm run test:smoke     # Playwright + Edge UI 冒烟（30 项，需要本机 Edge）
npm run screenshots    # 重新生成 docs/screenshots 截图
```

最近一次本机验证结果：

- 构建：通过（2451 modules；CSS 83.22 kB / gzip 15.43 kB；JS 535.63 kB / gzip 149.60 kB；仅有 chunk 体积提示）。
- API 集成测试：**26 pass / 0 fail**。
- UI smoke：**30 PASS / 0 FAIL**（登录、预约校验与冲突、模拟通话全链路、全部路由、客户详情、散客转化、桌台创建、报表导出、通知已读、设置保存、viewer 权限、退出登录、四种响应式宽度与演示数据重置）。
- 截图：12 张，已人工检查，均为虚构数据。

GitHub Actions 只运行构建与 API 集成测试；UI smoke 依赖 Microsoft Edge，因此不在 CI 中运行。详细说明见 [docs/TESTING.md](docs/TESTING.md)。

## 已知限制

- 真实电话、录音、流式 STT、LLM、飞书与 Webhook 自动投递均未接入；模拟能力不会被描述为真实服务。
- 预约删除、散客入座/取消等路径已实现，但尚未纳入自动化回归；使用前建议在备份副本上演练。
- 数据库为单机 SQLite，适合本地演示与单实例使用，不适合多实例并发生产部署。
- 演示账号密码写在 `.env.example` 与登录页中，仅用于本地演示；任何非本地部署都必须更换。
- 浏览器自动化依赖本机 Microsoft Edge，项目尚未配置跨浏览器测试矩阵。
- 未实现生产级 TLS、反向代理、密钥托管、限流、MFA 与高可用加固。

## 文档

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：信息架构、数据模型、模块依赖与适配器边界。
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：本地开发、API 约定、测试与排错。
- [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md)：88 项功能验收矩阵与真实覆盖率。
- [docs/SECURITY.md](docs/SECURITY.md)：认证、权限、CSRF、数据保护与残余风险。
- [SECURITY.md](SECURITY.md)：漏洞报告流程与安全范围。
- [docs/TESTING.md](docs/TESTING.md)：测试命令、CI 范围与当前验证记录。
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献方式与开发测试要求。
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：第三方依赖与许可证。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

你可以自由使用、复制、修改、合并、发布、分发、再许可和/或销售本软件的副本，但需保留版权声明与许可声明。本软件按“原样”提供，不附带任何明示或暗示的担保。

第三方依赖遵循各自许可证，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 贡献

欢迎阅读、试用和提出 Issue。提交代码前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，并通过 Issue 讨论非平凡改动的范围。

本项目为独立作品集演示，不包含原公司源码、品牌素材、真实客户数据、生产配置或内部服务地址。
