import { useState } from 'react';
import { BookOpen, Bot, CalendarCheck, CircleHelp, Database, PhoneCall, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { cn } from '../lib/format';

const TOPICS = [
  {
    key: 'flow', title: '模拟来电完整流程', icon: PhoneCall,
    steps: [
      '进入「来电中心」，点击「模拟来电」，选择虚构客户与场景。',
      '系统创建一条明确标记为「模拟」的来电，并尝试匹配本地客户档案。',
      '点击接听后，可生成模拟转写与模拟 AI 分析；转写内容来自本地演示脚本，不是真实语音识别。',
      '检查 AI 提取的日期、时间、人数与备注，点击「转预约」，服务端会执行容量与 90 分钟冲突检测。',
      '预约创建后，客户到店记录与通话关联会同步更新；整条链路均可在界面中复核。'
    ]
  },
  {
    key: 'booking', title: '预约与冲突规则', icon: CalendarCheck,
    steps: [
      '预约必须填写姓名、手机号、日期、时间、人数；手机号按 11 位格式校验。',
      '同一日期、相同桌台或组合包间，时间间隔小于冲突窗口（默认 90 分钟）会提示冲突。',
      '系统推荐前后 30–180 分钟内、以 30 分钟为步长的可用时段。',
      '容量不足会直接拒绝；覆盖冲突需要 appointments:override 权限，并写入审计日志。',
      '状态流转受服务端约束：待确认 → 已确认/已取消；已确认 → 已到店/未到店/已取消；已到店 → 已完成/已取消。'
    ]
  },
  {
    key: 'data', title: '数据导入、导出与备份', icon: Database,
    steps: [
      '「系统设置 → 数据与备份」支持客户、预约、通话 CSV 导出与完整 JSON 导出。',
      '导入 JSON 仅覆盖备份中出现的业务表，不恢复密码、密钥或敏感配置。',
      '备份保存在服务端本地目录，恢复前会校验备份格式与完整性。',
      '清除与重置仅影响业务数据，用户、角色、设置和审计日志保留。',
      '所有演示数据为虚构内容；导出前请确认不包含任何真实客户信息。'
    ]
  },
  {
    key: 'security', title: '账号、权限与安全', icon: ShieldCheck,
    steps: [
      '所有 API 权限均在服务端校验；前端隐藏按钮只是体验优化，不构成权限边界。',
      '角色：管理员、经理、坐席、只读。管理员可管理账号；其他角色按权限矩阵访问模块。',
      '登录使用 HttpOnly 会话 Cookie，服务端保存令牌哈希；连续失败会触发限流。',
      '所有写请求要求自定义 CSRF 请求头；来源与内容类型受安全头保护。',
      '飞书密钥等敏感配置以掩码返回，界面不会回显明文。'
    ]
  },
  {
    key: 'ai', title: '真实能力与模拟能力', icon: Bot,
    steps: [
      '真实可用：账号、预约、冲突检测、客户档案、散客、桌台、报表、通知、导入导出、备份恢复、审计。',
      '模拟可用：来电弹屏、接听、录音条目、实时转写、AI 摘要/标签/提取、飞书同步、Webhook 投递。',
      '需要外部配置：真实 STT、真实 LLM、SIP/话机设备、飞书应用凭据。',
      '未实现：真实电话拨号与录音文件处理、真实飞书 API 同步、真实 Webhook 网络投递。',
      '所有模拟结果在界面中带有「模拟」标记，不会伪装为真实服务。'
    ]
  },
  {
    key: 'roles', title: '推荐演示路径', icon: Users,
    steps: [
      '使用管理员账号登录，查看运营概览与系统诊断。',
      '完成一次模拟来电 → 转写 → AI 分析 → 创建预约。',
      '在预约管理中推进状态，检查冲突提示与附近时段推荐。',
      '在客户档案查看自动关联的客户、消费记录和合并功能。',
      '在桌台布局查看座位图、组合包间与营业时段。',
      '在运营报表查看趋势并导出 CSV；在系统设置创建备份。'
    ]
  }
] as const;

export function HelpPage() {
  const [active, setActive] = useState<string>(TOPICS[0].key);
  const topic = TOPICS.find((item) => item.key === active) || TOPICS[0];
  return (
    <div className="page-stack">
      <PageHeader eyebrow="支持" title="使用帮助" description="CallFlow 的功能说明、演示流程与真实/模拟能力边界。" />
      <div className="help-layout">
        <nav className="help-nav">
          {TOPICS.map(({ key, title, icon: Icon }) => (
            <button key={key} type="button" className={cn('help-nav__item', active === key && 'is-active')} onClick={() => setActive(key)}><Icon size={17} /><span>{title}</span></button>
          ))}
        </nav>
        <section className="panel help-content">
          <header className="panel__header"><div><h2>{topic.title}</h2><p>按步骤操作即可在当前本地演示环境复现。</p></div><BookOpen size={20} /></header>
          <ol className="help-steps">{topic.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
          <div className="inline-alert inline-alert--info"><CircleHelp size={16} /><span>如遇权限错误，请检查当前账号角色；如遇接口错误，请查看浏览器网络面板与服务端终端日志。</span></div>
        </section>
      </div>
      <section className="panel">
        <header className="panel__header"><div><h2>功能状态图例</h2><p>验收清单中使用的统一状态定义</p></div></header>
        <div className="legend-grid">
          <div><span className="status-badge tone-green">已实现并验证</span><p>接口、页面、服务端规则与实际测试均已完成。</p></div>
          <div><span className="status-badge tone-indigo">已实现待验证</span><p>代码已落地，但尚未完成端到端或多角色验证。</p></div>
          <div><span className="status-badge tone-amber">模拟模式可用</span><p>依赖外部能力的演示链路，明确标记模拟。</p></div>
          <div><span className="status-badge tone-slate">需要外部配置</span><p>需要设备、供应商凭据或合规确认后才能真实运行。</p></div>
          <div><span className="status-badge tone-muted">未实现</span><p>当前版本未提供的能力，不会以按钮或接口伪装。</p></div>
        </div>
      </section>
    </div>
  );
}
