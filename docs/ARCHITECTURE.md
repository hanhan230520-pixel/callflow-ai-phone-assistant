# CallFlow — 架构设计

## 1. 产品定位

CallFlow 是一个面向电话预约场景的完整工作台：

- 预约、客户、桌台、散客、通话、报表、通知、设置、用户与权限。
- 电话、STT、AI、飞书等外部能力通过适配器隔离。
- 默认提供完整模拟链路，无真实电话设备也可演示。
- 所有模拟数据与模拟 AI 结果明确标记，不伪装为真实服务。

## 2. 技术栈

- 前端：React 19 + TypeScript + Vite + React Router。
- 后端：Node.js 22 + Express 5 + Zod。
- 数据库：Node 内置 `node:sqlite`，WAL、外键、事务。
- 认证：服务端 session（HttpOnly Cookie）+ scrypt 密码哈希 + RBAC。
- 测试：Node Test Runner（API）+ 浏览器 smoke（Playwright-core/Edge）。
- 外部适配器：电话、STT、LLM、飞书、Webhook、更新；默认 mock。

## 3. 信息架构

```text
/login
/
├── /calendar        预约日历
├── /appointments    预约管理
├── /calls           电话工作台（模拟/真实状态）
├── /customers       客户档案
├── /walk-ins        散客登记
├── /tables          桌台与座位
├── /reports         报表中心
├── /notifications   通知中心
├── /settings        系统设置
├── /admin           用户、权限、数据与审计
├── /diagnostics     系统诊断
└── /help            帮助与功能状态
```

导航按“工作台 / 客户 / 运营 / 管理”分组，避免把所有功能堆在首页。

## 4. 后端模块

```text
server/
├── index.js              启动、环境变量、静态文件
├── app.js                Express 装配、路由、错误处理
├── db.js                 SQLite schema、连接、迁移入口
├── auth.js               scrypt、session、RBAC、审计
├── seed.js               虚构演示数据
├── domain/
│   ├── appointments.js   90 分钟冲突、附近时段、状态机、容量
│   ├── customers.js      客户合并、支付、标签、画像
│   ├── reports.js        KPI、趋势、分布、导出
│   └── data.js           JSON/CSV 导入导出、备份恢复
├── adapters/
│   ├── telephony.js      模拟来电、ADB/CTI 配置状态
│   ├── ai.js             模拟 STT/AI、真实 provider 边界
│   ├── feishu.js         模拟/真实飞书同步边界
│   └── webhook.js        事件投递、签名、超时、记录
└── routes/               auth/appointments/calls/...（按域拆分）
```

实现上允许按域合并文件，但边界必须清晰：路由负责校验与响应，domain 负责业务规则，adapter 负责外部服务。

## 5. 数据模型（核心）

```text
users 1─* sessions
users 1─* audit_logs

customers 1─* payments
customers 1─* appointments
customers 1─* calls
customers 1─* walk_ins

areas 1─* tables
tables *─* combo_rooms (通过 combo_room_tables)
time_slots

appointments 1─* appointment_status_history
appointments 1─* calls (通过 calls.appointment_id)
appointments 1─* payments

calls 1─* call_segments
calls 内嵌 ai_summary / ai_tags / ai_extracted（JSON）

notifications
settings
webhook_deliveries
sync_jobs
```

关键字段：

- `appointments.conflict_override`：记录是否由有权限用户覆盖冲突。
- `appointments.combo_id`：组合包间；与 `table_id` 二选一。
- `calls.is_simulated`：模拟通话标记。
- `calls.transcript / ai_summary / ai_tags / ai_extracted`：演示结果。
- `customers.tags / total_spent / visit_count`：客户画像与消费。
- `users.role`：admin / manager / agent / viewer。

## 6. 核心业务规则

### 6.1 预约状态机

```text
pending    → confirmed | cancelled
confirmed  → seated | no_show | cancelled
seated     → completed | cancelled
completed  → 终态
no_show    → 终态
cancelled  → 终态
```

管理员可强制修正，但必须写审计日志。

### 6.2 冲突检测

- 同一日期、同一桌台或组合包间。
- 开始时间相差小于 90 分钟。
- 排除 `cancelled`、`no_show`、`completed`。
- 组合包间按包含的桌台集合判断重叠。
- 冲突返回 409，附带冲突列表和附近可用时段。
- 有 `appointments:override` 权限的用户可 `overrideConflict=true` 强制创建，并写审计/通知。

### 6.3 附近时段

- 以目标时间为中心，向前/向后搜索 180 分钟。
- 30 分钟步长。
- 过滤容量不足、桌台停用、时间冲突。
- 返回最近的 4 个可用时段。

### 6.4 过去日期

- 新建/修改预约禁止 `date < today`（本地日期）。
- 服务端校验，前端只做提示。

### 6.5 客户联动

- 预约按手机号自动匹配客户；不存在则创建。
- 完成预约增加 `visit_count`。
- 支付记录增加 `total_spent`。
- 合并客户时合并标签、偏好、备注、支付、预约、通话，保留目标客户并写审计。

## 7. 模拟链路

```text
模拟来电
  → 按手机号匹配客户
  → 显示客户画像/话术
  → 接听，记录 answered_at
  → 生成模拟对话片段（明确标注“模拟”）
  → 模拟 STT 转写
  → 模拟 AI 摘要/标签/关键词
  → 提取预约字段（姓名/电话/日期/时间/人数/桌台/备注）
  → 打开预约表单并预填
  → 创建预约
  → 更新客户档案
  → 完成通话，生成通知/Webhook（模拟）
```

所有模拟结果带 `isSimulated` / `source: "mock"`，UI 使用“模拟”徽标。

## 8. 权限模型

| 权限 | admin | manager | agent | viewer |
|---|---|---|---|---|
| 查看工作台/预约/客户/通话 | ✓ | ✓ | ✓ | ✓ |
| 新建/编辑预约、客户、散客、通话 | ✓ | ✓ | ✓ | — |
| 覆盖预约冲突 | ✓ | ✓ | — | — |
| 删除预约/客户 | ✓ | ✓ | — | — |
| 桌台/区域/组合配置 | ✓ | ✓ | — | — |
| 报表查看/导出 | ✓ | ✓ | ✓ | ✓ |
| 设置修改 | ✓ | ✓ | — | — |
| 用户/角色/审计/数据恢复 | ✓ | — | — | — |
| 系统诊断 | ✓ | ✓ | — | — |

服务端中间件校验，前端只做隐藏/禁用。

## 9. 安全设计

- 密码 scrypt + 随机盐；演示账号密码来自环境变量或安全默认值。
- Session 随机 token 只存哈希；HttpOnly、SameSite=Strict、生产 Secure。
- 所有写请求要求自定义请求头，降低 CSRF 风险。
- Zod 校验、参数化 SQL、事务、JSON 体积限制。
- CSP、X-Content-Type-Options、X-Frame-Options、Referrer-Policy。
- 敏感设置返回时掩码；日志不记录密码/密钥。
- Webhook 默认禁止私网地址；当前只有强制模拟的测试投递，未接入真实自动事件。
- 录音/AI/飞书真实接入前需配置与合规确认。

## 10. 测试策略

- 单元/集成：认证、RBAC、冲突、附近时段、状态机、容量、客户合并、支付、散客转预约、模拟通话、AI 提取、报表、导入导出、设置掩码、飞书 mock。
- API 测试使用临时文件 SQLite 和真实 HTTP。
- UI smoke 覆盖登录、主要页面、模拟通话、创建预约、客户详情、响应式。
- 每次重要模块完成后运行 `npm test`、`npm run build`、`npm run test:smoke`。

## 11. 功能状态口径

- 已实现并验证：有真实业务逻辑、有测试或实测记录。
- 已实现但尚未验证：代码与接口存在，但本阶段未完成实测。
- 模拟模式可用：通过本地 mock 完成完整链路，明确标记。
- 需要外部设备或配置：适配器/配置界面存在，真实服务未启用。
- 未实现：没有对应代码、接口、页面或数据模型。

不得用“页面存在/按钮存在/接口存在”代替功能验收。
