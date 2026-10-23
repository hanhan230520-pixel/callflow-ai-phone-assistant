# CallFlow 安全说明

## 1. 安全定位

CallFlow 是**本地演示与作品集项目**，不是生产系统。它已经实现了服务端登录、会话、RBAC、CSRF 请求头校验与审计日志，但未做生产级 TLS、密钥托管、速率限制、MFA、多租户隔离或高可用加固。

默认仅监听 `127.0.0.1:8788`。**不要将本项目直接暴露到公网、局域网共享环境或真实业务数据环境中。**

## 2. 数据分类与隐私

| 数据 | 来源 | 处理 |
| --- | --- | --- |
| 客户姓名 | 虚构种子 | “测试客户 01”等虚构名称 |
| 手机号 | 虚构种子 | 虚构号码；界面用 `138****0001` 形式脱敏 |
| 预约与备注 | 虚构种子 | 通用场景文案，不含真实业务信息 |
| 通话转写与 AI 结果 | 模拟适配器 | 明确标注模拟，不含真实通话内容 |
| 用户与密码 | 本地数据库 | 密码仅保存 scrypt 哈希与随机盐 |
| 集成配置 | 设置表 / 环境变量 | 敏感字段读取时掩码；不向仓库提交真实凭据 |
| 运行时数据库 | 本地 SQLite | 已被 `.gitignore` 排除 |
| 备份文件 | `backups/` | 已被 `.gitignore` 排除 |
| 日志 | 本地控制台 | 仅启动信息与 5xx 摘要；不记录请求体、密码或 Cookie |

项目不包含原公司生产数据、客户名单、通话录音、内部地址、账号 ID、第三方平台凭据、API Key、Token 或私有证书。原内部项目仅以只读方式检查，未复制任何代码或数据。

## 3. 威胁模型与处置

| 风险 | 场景 | 当前处置 | 残余风险 |
| --- | --- | --- | --- |
| 未授权访问 | 未登录访问业务接口 | 服务端会话校验；业务路由统一 `requireAuth`；未登录返回 401 | 同机其他进程仍可访问回环端口 |
| 权限提升 | 低权限角色调用管理接口 | 服务端路由级 RBAC；前端隐藏入口只作体验优化 | 角色模型为静态映射，未做细粒度数据权限 |
| CSRF | 跨站表单触发写操作 | 所有写请求要求 `x-callflow-csrf: 1`；Cookie `SameSite=Strict` | 自定义头不是一次性 token；若引入跨域客户端需重新评估 |
| 会话劫持 | Cookie 被窃取 | HttpOnly、SameSite=Strict；会话 12 小时过期；退出即删除 | 本地 HTTP 下无 TLS；`Secure` 仅在 `NODE_ENV=production` 生效 |
| 暴力破解 | 反复尝试登录 | scrypt 校验；错误消息不区分用户名是否存在 | 无速率限制、锁定或验证码 |
| SQL 注入 | 搜索/筛选参数进入查询 | 全部 SQL 参数绑定；枚举值白名单 | 无 |
| XSS | 客户备注、转写文本回显 | React 默认转义；无 `dangerouslySetInnerHTML`；CSP `script-src 'self'` | 无 |
| 请求体滥用 | 超大 JSON/CSV | JSON 限制 10MB、urlencoded 1MB；字段长度上限 | 导入接口限制较宽，无速率限制 |
| 点击劫持 | 被嵌入第三方页面 | `X-Frame-Options: DENY` 与 `frame-ancestors 'none'` | 无 |
| MIME 嗅探 | 响应被错误解释 | `X-Content-Type-Options: nosniff` | 无 |
| 隐私泄露 | 手机号完整展示 | 列表与详情脱敏；API 只返回虚构演示数据 | 数据库内仍保存完整虚构号码 |
| 配置泄露 | 飞书/LLM 凭据被读取 | 读取接口掩码；真实凭据只从环境变量读取 | 本地 SQLite 未加密 |
| SSRF | Webhook 指向内网 | 默认禁止私网地址；需 `ALLOW_PRIVATE_WEBHOOKS=true` | 当前测试投递强制模拟，未发起真实网络请求 |
| 审计篡改 | 审计日志被本地修改 | 关键操作写 `audit_logs`；仅 admin/manager 可读 | 本地 SQLite 无防篡改或远端归档 |
| 演示重置滥用 | 任意登录用户重置数据 | 需要 `data:import` 权限；`DEMO_MODE=false` 可关闭 | 高权限演示账号密码公开写在登录页 |
| 依赖供应链 | 依赖漏洞 | 锁定版本与 `package-lock.json`；执行 `npm audit` | 无自动扫描 CI |
| 数据持久化 | 数据库/备份被提交 | `.gitignore` 排除 db、WAL、日志、备份 | 需人工审查发布内容 |

## 4. 已实现的控制

### 4.1 认证与会话

- 密码使用 Node `scrypt`（16 字节随机盐、64 字节派生密钥）哈希。
- 密码比较使用 `crypto.timingSafeEqual`。
- 会话 token 为 32 字节随机值；数据库只保存其 SHA-256 摘要。
- 会话有效期 12 小时；过期或用户停用后自动失效。
- Cookie：`HttpOnly`、`SameSite=Strict`、`Path=/`；生产环境下 `Secure`。
- 退出登录删除当前会话；管理员停用账号或修改密码可清理该用户会话。

### 4.2 权限与审计

- 四级角色：admin / manager / agent / viewer。
- 服务端 `requirePermission()` 在路由层校验；前端 `can()` 仅控制展示。
- 登录、用户创建/调整/停用、冲突覆盖、数据导入导出、备份与集成测试等写入 `audit_logs`。
- 审计查询需要 `audit:read`。

### 4.3 请求与响应

- 所有修改类 `/api` 请求要求 `x-callflow-csrf: 1`。
- Zod 校验类型、长度、枚举、手机号、日期、时间与人数；未知字段被剥离。
- 统一 `AppError` 错误处理；5xx 不返回内部堆栈。
- 请求体限制：JSON 10MB、urlencoded 1MB。
- 安全响应头：
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: same-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `X-Powered-By` 已禁用
- `/api` 响应设置 `Cache-Control: no-store`。

### 4.4 前端

- React 文本插值渲染用户内容，默认转义。
- 手机号通过 `maskPhone()` 展示。
- 表单客户端校验与服务端错误映射。
- 提交中禁用按钮，防止重复提交。
- 抽屉/对话框关闭时隐藏并移出交互，避免隐藏控件被聚焦。
- 不加载远程字体、CDN、分析脚本或第三方追踪。

### 4.5 配置与仓库

- `.env`、`.env.*`（保留 `.env.example`）、数据库、WAL、日志、构建产物、备份与测试产物均被 `.gitignore` 排除。
- 不存在 `.git` 目录；未执行任何 Git 操作。
- 截图与文档仅含虚构数据。
- 依赖许可证记录于 `THIRD_PARTY_NOTICES.md`。

## 5. 模拟与真实边界

以下能力**没有**接入真实服务，不能视为生产安全边界内的实现：

- 真实电话网络、SIP 中继、CTI / ADB 设备接入（当前仅有配置占位）。
- 真实麦克风采集、录音存储、回放与下载。
- 真实流式 STT。
- 真实 LLM 调用。
- 真实飞书 API 同步。
- 真实 Webhook 自动事件投递。

模拟响应带 `simulated: true`，状态接口返回 `realReady: false`，界面显示“模拟”“无真实音频”“不会发起真实网络请求”等提示。任何真实接入都必须重新评估凭据管理、数据出境、录音合规、告知同意与访问审计。

## 6. 明确未实现的安全能力

- HTTPS/TLS 终止与 HSTS。
- MFA、登录速率限制、账号锁定与验证码。
- 细粒度数据权限与多租户隔离。
- 数据库静态加密、备份加密与密钥托管。
- 审计日志防篡改、远端归档与保留策略。
- 数据保留期限、导出审批与删除流程。
- WAF、SAST/DAST 与自动化依赖漏洞扫描 CI。

## 7. 依赖与供应链

- Runtime：React、React DOM、React Router、Express、Zod、date-fns、lucide-react。
- 开发：Vite、TypeScript、Playwright-core、concurrently 等。
- 许可证：直接依赖为 MIT / ISC / Apache-2.0；传递依赖另含 BSD-3-Clause、0BSD、CC-BY-4.0，详见 `THIRD_PARTY_NOTICES.md`。
- `package-lock.json` 锁定精确版本，registry 地址已规范为 `registry.npmjs.org`。
- 2026-10-22 执行 `npm audit --omit=dev --registry=https://registry.npmjs.org`，结果为 **0 vulnerabilities**。该结果只代表当时公开公告数据，不构成持续安全保证。

## 8. 安全验证记录（审核时快照）

| 检查 | 结果 |
| --- | --- |
| 新项目旧品牌/专有技术字符串扫描 | 0 处匹配 |
| 密钥/Token/私钥/连接串模式扫描 | 0 处业务凭据 |
| `.env` 实际文件 | 不存在（仅 `.env.example`） |
| Git 仓库状态 | 审核时未初始化；本轮未执行 Git 操作 |
| 服务端认证 / RBAC / CSRF 测试 | API 测试覆盖并通过 |
| 冲突覆盖审计 | API 测试验证审计记录 |
| 安全响应头 | 已验证生效 |
| 依赖审计 | 0 vulnerabilities（公开 registry） |
| API 集成测试 | 26 pass / 0 fail |
| 浏览器 UI 冒烟 | 30 PASS / 0 FAIL |

## 9. 发布前检查清单

- [ ] 项目所有者已确认代码与设计版权，并批准公开发布。
- [ ] 确认仓库中不含 `.env`、`data/*.db*`、`backups/`、日志、`dist/`、`node_modules/`。
- [ ] 再次执行品牌字符串扫描与密钥扫描。
- [ ] 确认截图与文档仅含虚构数据。
- [ ] 确认 README 与功能矩阵没有把模拟能力描述为真实接入。
- [ ] 如部署到任何非本机环境，先实现 HTTPS、速率限制、MFA、密钥托管与备份加密。
- [ ] 更新依赖并重新执行 `npm audit`、`npm test`、`npm run build`、`npm run test:smoke`。
- [ ] **在完成版权确认与许可证替换前，不创建公开仓库。**

## 10. 漏洞报告

如发现安全问题，请通过项目维护者提供的私下渠道报告，不要在公开 Issue 中附带真实个人信息、密钥或可复现的生产数据。本项目为演示性质，修复优先级由维护者根据影响范围决定。
