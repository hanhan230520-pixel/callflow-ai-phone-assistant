# CallFlow 开发指南

## 1. 环境准备

- **Node.js >= 22.5.0**：使用内置 `node:sqlite`。
- npm 10+。
- 可选 **Microsoft Edge**：UI 冒烟测试与截图脚本默认调用 Windows Edge，也可用 `BROWSER_PATH` 指定其他 Chromium 内核浏览器。

```bash
node --version
npm --version
npm install
```

## 2. 本地运行

```bash
npm run dev
```

`concurrently` 会同时启动：

- API：`node --watch server/index.js`，默认 `http://127.0.0.1:8788`
- Web：Vite，默认 `http://127.0.0.1:5174`，`/api` 代理到 `8788`

生产式本地运行：

```bash
npm run build
npm start
```

此时只访问 `http://127.0.0.1:8788`，Express 同时提供 `dist/` 与 `/api`。

首次启动会自动建表并写入虚构演示数据；登录页默认填入 admin 演示账号。

## 3. npm 脚本

| 脚本 | 作用 |
| --- | --- |
| `npm run dev` | 同时启动 API 与 Vite |
| `npm run build` | `tsc -b` 类型检查 + Vite 生产构建 |
| `npm start` | 启动 Express，提供 `dist` 与 API |
| `npm test` | Node Test Runner API 集成测试 |
| `npm run test:smoke` | Playwright-core UI 冒烟测试 |
| `npm run screenshots` | 生成 `docs/screenshots/` 截图 |
| `npm run preview` | Vite 预览前端构建产物 |

## 4. 配置

```bash
cp .env.example .env
```

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8788` | API 端口 |
| `HOST` | `127.0.0.1` | 监听地址，默认仅本机 |
| `DATABASE_PATH` | `./data/callflow-full.db` | SQLite 文件路径 |
| `BACKUP_DIR` | `./backups` | 本地备份目录 |
| `DEMO_MODE` | `true` | 是否允许演示数据重置 |
| `DEMO_ADMIN_PASSWORD` | 演示值 | admin 初始密码 |
| `DEMO_MANAGER_PASSWORD` | 演示值 | manager 初始密码 |
| `DEMO_AGENT_PASSWORD` | 演示值 | agent 初始密码 |
| `DEMO_VIEWER_PASSWORD` | 演示值 | viewer 初始密码 |
| `AI_MODE` | `mock` | AI 适配器模式；当前真实模式未实现 |
| `STT_PROVIDER` | 空 | 预留的 STT 提供方配置 |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_APP_TOKEN` | 空 | 飞书配置；真实同步未实现 |
| `ALLOW_PRIVATE_WEBHOOKS` | `false` | 是否允许私网 Webhook 地址 |

`.env` 不得提交。真实凭据只从环境变量读取，`.env.example` 中只保留变量名与假值。

## 5. 认证、权限与 API 约定

### 登录与会话

1. `POST /api/auth/login` 使用 scrypt 校验密码，创建服务端会话并写入 HttpOnly Cookie。
2. 受保护接口通过 Cookie 解析会话；未登录返回 `401 UNAUTHORIZED`。
3. `POST /api/auth/logout` 删除会话并清 Cookie。
4. `PATCH /api/auth/password` 修改密码后清理该用户的旧会话。

### CSRF

所有修改类 `/api` 请求（POST / PATCH / PUT / DELETE）必须带：

```http
x-callflow-csrf: 1
```

否则返回 `403 CSRF_REQUIRED`。前端已在 `src/api.ts` 统一添加该请求头。

### RBAC

角色为 `admin` / `manager` / `agent` / `viewer`。权限在服务端路由层校验，前端 `can()` 只控制导航与按钮展示。

- admin：`*`
- manager：业务读写、删除、数据导入导出、备份、冲突覆盖
- agent：日常业务读写，无删除与冲突覆盖
- viewer：只读，可读设置

### 错误格式

业务错误统一抛出 `AppError(message, status, code, details?)`，由全局错误处理返回：

```json
{ "error": { "message": "该桌台在前后 90 分钟内已有有效预约", "code": "TABLE_CONFLICT", "details": {} } }
```

常见错误码：`UNAUTHORIZED`、`FORBIDDEN`、`CSRF_REQUIRED`、`VALIDATION_ERROR`、`NOT_FOUND`、`PAST_DATE`、`CAPACITY_EXCEEDED`、`INVALID_TRANSITION`、`TABLE_CONFLICT`。

### 列表与分页

列表接口通常返回：

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20, "totalPages": 0 }
```

### 手动调用示例

```bash
# 登录并保存 Cookie
curl -s -c cookie.txt -X POST http://127.0.0.1:8788/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'x-callflow-csrf: 1' \
  -d '{"username":"admin","password":"CallFlowDemo!2026"}'

# 检查健康状态
curl -s http://127.0.0.1:8788/api/health

# 创建预约
curl -s -b cookie.txt -X POST http://127.0.0.1:8788/api/appointments \
  -H 'Content-Type: application/json' \
  -H 'x-callflow-csrf: 1' \
  -d '{"guestName":"测试客户 99","phone":"13800009999","date":"2030-01-01","time":"18:30","partySize":2,"tableId":"table_a01","source":"phone","status":"pending","notes":"虚构测试数据"}'
```

示例手机号与姓名均为虚构内容，请勿使用真实客户信息测试。

## 6. 数据与种子

- `server/db.js` 在首次打开数据库时建表并调用 `seedDemoData()`。
- 种子日期相对“今天”生成，始终包含昨天、今天、明天与未来几天的预约。
- 种子客户名称为“测试客户 01”等，手机号形如 `13800000001`，前端通过 `maskPhone()` 掩码展示。
- 演示数据重置：`POST /api/data/reset-demo`（需要 `data:import` 权限）。
- 其他数据操作：`POST /api/data/import/json`、`POST /api/data/import/csv`、`POST /api/data/clear`、`POST /api/data/backups`、`POST /api/data/backups/restore`。
- 测试使用临时目录中的独立数据库，不修改本地演示库。

手动检查数据库：

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('./data/callflow-full.db');console.log(db.prepare('select count(*) c from appointments').get())"
```

修改种子后，删除本地 `data/callflow-full.db*` 再启动，或调用演示重置。

## 7. 后端开发约定

1. 路由位于 `server/routes/`，业务逻辑位于 `server/domain/`，外部依赖位于 `server/adapters/`。
2. 新增写接口时先在 `server/lib/schemas.js` 定义 Zod schema，再在路由中解析。
3. 所有 SQL 使用参数绑定，禁止拼接用户输入。
4. 业务错误使用 `AppError`，不要直接 `res.status(...).send`。
5. 多语句写操作使用显式事务，确保 `COMMIT` / `ROLLBACK` 成对。
6. 关键写操作调用 `audit()` 写入审计日志，不记录密码、Cookie 或完整敏感请求体。
7. 新增字段要同步：建表 SQL、Zod schema、SELECT 映射、TypeScript 类型、前端表单。
8. 外部能力必须通过适配器，并在响应中标注 `simulated` 与真实接入状态。

## 8. 前端开发约定

- `src/api.ts` 统一处理请求、Cookie、CSRF 头、401 跳转与错误消息。
- 页面负责取数与筛选；表单/详情通过 props 回调通知结果。
- 复用 `Drawer` / `Dialog`（`src/components/Overlay.tsx`），保持遮罩、Esc 与滚动锁定一致。
- 复用 `Field`、`EmptyState`、`ErrorState`、`PageLoader` 与 `useToast()`。
- 手机号展示使用 `maskPhone()`；列表与详情不直接展示完整号码。
- 状态、来源、等级文案从 `src/lib/format.ts` 获取，避免重复硬编码。
- 新样式优先复用 `src/styles.css` 的 token 与现有类；保持白色面板、浅灰画布与克制强调色。
- 所有交互控件必须有可见文本或 `aria-label`；异步提交必须防止重复点击。
- 模拟结果必须显示“模拟”标识，不得伪装为真实电话或 AI 输出。

## 9. 测试

### API 集成测试

```bash
NODE_ENV=test npm test
```

测试会：

- 在系统临时目录创建 SQLite 文件；
- 用 `createApp()` 启动临时端口；
- 通过 `fetch` 验证登录、RBAC、CSRF、预约冲突、状态机、客户合并、通话分析、通知、导入导出等；
- 结束后关闭数据库与服务。

当前基线：**26 pass / 0 fail**。新增接口至少覆盖成功路径、字段校验错误与关键业务冲突。

### UI 冒烟测试

```bash
npm run build
npm start            # 另开终端，保持运行
npm run test:smoke
```

默认连接 `http://127.0.0.1:8788` 并使用 Edge：

```bash
BASE_URL=http://127.0.0.1:8788 BROWSER_PATH="C:/Path/To/msedge.exe" npm run test:smoke
```

当前覆盖：登录、演示重置、预约客户端校验、冲突检测与创建、预约详情、模拟通话/转写/AI 全链路、13 个路由、客户详情、散客登记与转预约、桌台创建、报表范围/图表/CSV 下载、通知已读、设置保存与适配器测试、viewer 权限、退出登录、1440/1024/768/390 响应式、最终重置。当前基线：**30 PASS / 0 FAIL**。

### 截图

```bash
npm run screenshots
```

输出到 `docs/screenshots/`。脚本会登录、重置演示数据并访问主要页面，需先完成构建并启动服务。

## 10. 常见问题

### `node:sqlite` 实验性警告

Node.js 22–24 会输出 `ExperimentalWarning`，不影响运行。低于 22.5 会因缺少模块而失败。

### 端口被占用

```bash
PORT=8790 npm start
```

若修改 API 端口，需要同步调整 `vite.config.ts` 中的代理目标，以及 smoke/截图脚本的 `BASE_URL`。

### UI 测试无法启动浏览器

- 确认 Edge 路径存在。
- 通过 `BROWSER_PATH` 显式传入可执行文件路径。
- 使用正斜杠或正确转义的反斜杠。

### 页面空白 / CSP 报错

生产服务会发送 CSP。若新增外部字体、图片或脚本，需要同步调整 `server/app.js` 中的 CSP，而不是移除安全头。

### 数据库结构未更新

当前使用 `CREATE TABLE IF NOT EXISTS`，不会自动迁移已有表。演示阶段可删除 `data/callflow-full.db*` 后重启；长期开发应引入显式迁移脚本。

## 11. 发布前检查

- `npm run build` 通过。
- `NODE_ENV=test npm test` 全部通过。
- `npm run test:smoke` 全部通过。
- 新页面在 1440px、768px 与 390px 宽度下可用。
- 没有新增真实个人信息、密钥、`.env`、数据库或日志。
- 文档中的功能状态与实际实现一致，未把模拟能力描述为真实接入。
- 若涉及新依赖，更新 `THIRD_PARTY_NOTICES.md` 并确认许可证兼容性。
- **未经项目所有者确认，不执行任何 Git 提交、推送或公开发布。**
