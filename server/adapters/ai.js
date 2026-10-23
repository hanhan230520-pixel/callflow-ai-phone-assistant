import { addDays, localDateString, minutesToTime, timeToMinutes } from '../lib/time.js';

export const AI_SCENARIOS = ['reservation', 'business', 'birthday', 'complaint', 'inquiry', 'vip', 'cancel'];

const KEYWORD_RULES = [
  { key: 'complaint', label: '投诉风险', level: 'high', pattern: /投诉|不满|差评|失望|体验不好|等了很久/ },
  { key: 'birthday', label: '生日', level: 'info', pattern: /生日|蛋糕|寿星/ },
  { key: 'anniversary', label: '纪念日', level: 'info', pattern: /纪念日|周年|求婚/ },
  { key: 'business', label: '商务宴请', level: 'info', pattern: /商务|公司|发票|客户|宴请/ },
  { key: 'wine', label: '酒水需求', level: 'info', pattern: /红酒|白酒|酒水|开瓶/ },
  { key: 'vip', label: 'VIP', level: 'info', pattern: /VIP|会员|老客户|常客/i },
  { key: 'private_room', label: '包间', level: 'info', pattern: /包间|包厢|独立空间/ },
  { key: 'window', label: '靠窗', level: 'info', pattern: /靠窗|窗边/ },
  { key: 'child', label: '儿童', level: 'info', pattern: /儿童|孩子|宝宝|座椅/ },
  { key: 'allergy', label: '过敏/忌口', level: 'high', pattern: /过敏|忌口|不吃|乳制品|海鲜|花生/ },
  { key: 'parking', label: '停车', level: 'info', pattern: /停车|车位/ },
  { key: 'large_party', label: '多人聚餐', level: 'info', pattern: /团建|聚会|多人|十几个人/ }
];

export function detectKeywords(text = '') {
  return KEYWORD_RULES.filter((rule) => rule.pattern.test(String(text))).map(({ pattern, ...rule }) => rule);
}

function scenarioDetails(scenario, customer, context = {}) {
  const date = context.date || addDays(localDateString(), 1);
  const time = context.time || '18:30';
  const party = context.partySize || (scenario === 'business' ? 8 : scenario === 'birthday' ? 6 : 4);
  const base = {
    date, time, partySize: Number(party),
    occasion: scenario === 'birthday' ? '生日' : scenario === 'business' ? '商务宴请' : '普通用餐',
    tablePreference: scenario === 'complaint' || scenario === 'inquiry' ? '靠窗' : '',
    notes: customer?.notes || ''
  };
  if (scenario === 'business') {
    base.occasion = '商务宴请';
    base.tablePreference = '包间';
    base.notes = '需要打印发票；安排安静位置。';
  } else if (scenario === 'birthday') {
    base.occasion = '生日';
    base.notes = `${customer?.allergies ? `过敏：${customer.allergies}。` : ''}希望准备简洁的生日卡片。`;
  } else if (scenario === 'complaint') {
    base.occasion = '回访/投诉处理';
    base.notes = '客户提到此前等待时间较长；需要主管回访并安排靠窗位。';
  } else if (scenario === 'inquiry') {
    base.occasion = '用餐咨询';
    base.notes = '咨询停车与菜单，暂未确认预约。';
  } else if (scenario === 'vip') {
    base.occasion = 'VIP 到店';
    base.tablePreference = '安静包间';
    base.notes = 'VIP 客户，优先安排；确认偏好与忌口。';
  } else if (scenario === 'cancel') {
    base.occasion = '取消预约';
    base.notes = '客户希望取消当前预约，需要确认原因并记录。';
  }
  return base;
}

export function buildDialog(customer, scenario = 'reservation', context = {}) {
  const details = scenarioDetails(scenario, customer, context);
  const name = customer?.name || '来电客户';
  const phone = customer?.phone || '13800000000';
  const preference = customer?.preferences ? `您之前偏好${customer.preferences}，` : '';
  const allergy = customer?.allergies ? `注意到您有${customer.allergies}过敏，` : '';
  const dateLabel = details.date === addDays(localDateString(), 1) ? '明天' : details.date;
  const scripts = {
    reservation: [
      ['agent', '您好，CallFlow 预约中心，请问有什么可以帮您？'],
      ['customer', `你好，我想预约${dateLabel}晚上 ${details.time}，${details.partySize} 位。`],
      ['agent', `${preference}${allergy}我帮您确认一下：${dateLabel} ${details.time}，${details.partySize} 位，对吗？`],
      ['customer', '对，最好安排靠窗的位置，如果有包间也可以。'],
      ['agent', '好的，我为您记录靠窗偏好，并检查桌台容量。请问怎么称呼？'],
      ['customer', `我姓${name.slice(0, 1)}，手机号是 ${phone}。`],
      ['agent', '已为您匹配客户档案。稍后我会发送确认信息。'],
      ['customer', '好的，谢谢。']
    ],
    business: [
      ['agent', '您好，CallFlow 预约中心。'],
      ['customer', `我们公司想订${dateLabel} ${details.time}，${details.partySize} 位商务宴请，需要包间和发票。`],
      ['agent', '明白，商务宴请需要安静包间、发票和停车指引。我为您检查组合包间容量。'],
      ['customer', '对，最好能坐得宽松一点，预算人均 300 左右。'],
      ['agent', '已记录预算和发票需求。请问联系人和手机号？'],
      ['customer', `姓${name.slice(0, 1)}，${phone}。`],
      ['agent', '已记录，稍后发送包间与菜单确认信息。']
    ],
    birthday: [
      ['agent', '您好，CallFlow 预约中心。'],
      ['customer', `${dateLabel} ${details.time} 想给家人过生日，${details.partySize} 位，有忌口。`],
      ['agent', `${allergy || '请告诉我具体忌口，'}我帮您标注生日场景，并确认是否能准备简单蛋糕。`],
      ['customer', '不要乳制品，其他都可以。靠窗或包间都行。'],
      ['agent', '已记录生日、无乳制品和座位偏好。请问联系人和手机号？'],
      ['customer', `${name}，${phone}。`],
      ['agent', '已匹配客户档案，稍后与您确认蛋糕和菜单。']
    ],
    complaint: [
      ['agent', '您好，CallFlow 预约中心。'],
      ['customer', '上次来用餐等了很久，体验不太好，我想反馈一下。'],
      ['agent', '非常抱歉给您带来不好的体验。我先记录您的问题，并安排主管回访。'],
      ['customer', `这次还是想订${dateLabel} ${details.time}，${details.partySize} 位，希望安排靠窗。`],
      ['agent', '感谢您的反馈。我已标记投诉风险和靠窗偏好，会优先安排。'],
      ['customer', `${name}，${phone}。`],
      ['agent', '已记录，主管会在今天内回访。']
    ],
    inquiry: [
      ['agent', '您好，CallFlow 预约中心。'],
      ['customer', `我想问一下${dateLabel}晚上有没有${details.partySize}人位，停车方便吗？`],
      ['agent', '我帮您查询。请问大概几点到店？是否有忌口或座位偏好？'],
      ['customer', `大概 ${details.time}，最好靠窗。`],
      ['agent', '已记录咨询信息，是否需要我直接为您预留？'],
      ['customer', '先不订，我晚点确认。'],
      ['agent', '好的，我把这次咨询记录为待跟进。']
    ],
    vip: [
      ['agent', '您好，CallFlow VIP 服务专线。'],
      ['customer', `${dateLabel} ${details.time}，${details.partySize} 位，还是安排安静包间。`],
      ['agent', '已识别您的 VIP 档案，我为您优先检查包间并确认偏好。'],
      ['customer', '菜单按之前的偏好安排，注意忌口。'],
      ['agent', '已记录，稍后由专属顾问与您确认。'],
      ['customer', '好的。']
    ],
    cancel: [
      ['agent', '您好，CallFlow 预约中心。'],
      ['customer', '我想取消之前的预约，临时有事去不了。'],
      ['agent', '好的，我帮您查询。请问是哪个日期的预约？'],
      ['customer', `${dateLabel} ${details.time}，${details.partySize} 位。`],
      ['agent', '已找到预约。取消后会释放桌台，需要为您改约其他时间吗？'],
      ['customer', '暂时不用，之后再说。'],
      ['agent', '已记录取消，稍后发送确认。']
    ]
  };
  const script = scripts[scenario] || scripts.reservation;
  let cursor = 0;
  return script.map(([speaker, text], index) => {
    const duration = Math.max(2200, text.length * 120);
    const segment = { speaker, startMs: cursor, endMs: cursor + duration, text, isFinal: true };
    cursor += duration + 350;
    return { ...segment, index };
  });
}

export function analyzeCall({ customer, transcript, scenario = 'reservation', context = {} }) {
  const details = scenarioDetails(scenario, customer, context);
  const text = String(transcript || '');
  const keywords = detectKeywords(text);
  const tags = [...new Set([
    ...keywords.map((item) => item.label),
    ...(customer?.tier === 'vip' ? ['VIP'] : []),
    ...(customer?.tags || [])
  ])];
  const negative = keywords.some((item) => item.key === 'complaint') || scenario === 'complaint';
  const summaryMap = {
    reservation: `${customer?.name || '来电客户'}咨询 ${details.date} ${details.time}、${details.partySize} 人用餐，希望安排合适桌台。`,
    business: `${customer?.name || '来电客户'}咨询 ${details.date} ${details.time} 商务宴请，${details.partySize} 人，需要包间和发票。`,
    birthday: `${customer?.name || '来电客户'}计划 ${details.date} ${details.time} 生日聚餐，${details.partySize} 人，有忌口，希望安排靠窗或包间。`,
    complaint: `${customer?.name || '来电客户'}反馈此前等待时间较长，仍有 ${details.date} ${details.time}、${details.partySize} 人预约意向，需要主管回访。`,
    inquiry: `${customer?.name || '来电客户'}咨询 ${details.date} 晚间 ${details.partySize} 人位和停车信息，暂未确认预约。`,
    vip: `${customer?.name || '来电客户'}（VIP）预约 ${details.date} ${details.time}、${details.partySize} 人，偏好安静包间。`,
    cancel: `${customer?.name || '来电客户'}希望取消 ${details.date} ${details.time}、${details.partySize} 人的预约。`
  };
  const extracted = {
    guestName: customer?.name || '演示来电客户',
    phone: customer?.phone || context.phone || '',
    customerId: customer?.id || null,
    date: details.date,
    time: details.time,
    partySize: details.partySize,
    occasion: details.occasion,
    tablePreference: details.tablePreference,
    notes: details.notes,
    source: 'phone',
    scenario,
    confidence: 0.86,
    simulated: true
  };
  return {
    summary: summaryMap[scenario] || summaryMap.reservation,
    tags,
    keywords,
    sentiment: negative ? 'negative' : 'positive',
    extracted,
    simulated: true,
    provider: 'mock-local',
    generatedAt: new Date().toISOString()
  };
}

export function scriptSuggestion(customer, scenario = 'reservation') {
  const details = scenarioDetails(scenario, customer, {});
  const lines = [
    `您好，${customer?.name || '您好'}，这里是 CallFlow 预约中心。`,
    customer?.preferences ? `我注意到您偏好${customer.preferences}，会优先为您安排。` : '请问您对座位或用餐时间有什么偏好？',
    customer?.allergies ? `同时确认一下：您有${customer.allergies}过敏，我们会提前标注。` : '请问是否有忌口或食物过敏？',
    scenario === 'complaint' ? '对您此前的不佳体验我们非常抱歉，我会安排主管回访并记录改进措施。' : `我帮您确认 ${details.date} ${details.time}、${details.partySize} 人的安排，可以吗？`,
    '确认后我会发送预约信息，并提醒您到店时间。'
  ];
  return { scenario, lines, simulated: true, provider: 'mock-local' };
}

export function customerProfile(customer, stats = {}) {
  const tags = new Set(customer?.tags || []);
  if (customer?.tier === 'vip') tags.add('VIP');
  if (Number(stats.totalSpent || customer?.totalSpent || 0) >= 3000) tags.add('高价值');
  if (Number(stats.noShowCount || 0) > 0) tags.add('需确认到店');
  if (customer?.allergies) tags.add('忌口需提醒');
  const suggestions = [];
  if (customer?.preferences) suggestions.push(`到店前确认偏好：${customer.preferences}`);
  if (customer?.allergies) suggestions.push(`后厨与服务员提醒过敏信息：${customer.allergies}`);
  if (customer?.tier === 'vip') suggestions.push('安排专属接待，优先确认包间/安静区域');
  if (Number(stats.noShowCount || 0) > 0) suggestions.push('发送二次确认，降低未到店风险');
  if (!suggestions.length) suggestions.push('记录本次沟通偏好，完善客户画像');
  return { tags: [...tags], suggestions, simulated: true, provider: 'mock-local' };
}

export function aiStatus(settings = {}) {
  const mode = settings.ai_mode || 'mock';
  return {
    mode,
    mockAvailable: true,
    stt: {
      mode: settings.transcription_enabled === false ? 'disabled' : 'mock',
      status: settings.transcription_enabled === false ? '已关闭' : '模拟转写可用',
      realProvider: process.env.STT_PROVIDER || '',
      realReady: false,
      note: '真实 STT 需要外部服务配置；当前演示使用确定性模拟文本。'
    },
    llm: {
      mode,
      status: mode === 'mock' ? '模拟 AI 可用' : '需要外部模型配置',
      provider: mode === 'mock' ? 'mock-local' : (settings.ai_model || 'not-configured'),
      realReady: false,
      note: '真实模型接口仅保留适配器边界，默认不发起外部请求。'
    },
    scenarios: AI_SCENARIOS,
    disclaimer: '所有模拟转写、摘要、标签和提取结果均由本地规则生成，不代表真实 AI 服务输出。'
  };
}

export function normalizeScenario(value) {
  return AI_SCENARIOS.includes(value) ? value : 'reservation';
}
