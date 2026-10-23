export const TELEPHONY_MODES = ['mock', 'adb', 'cti'];

export function telephonyStatus(settings = {}) {
  const mode = TELEPHONY_MODES.includes(settings.telephony_mode) ? settings.telephony_mode : 'mock';
  return {
    mode,
    mockAvailable: true,
    device: mode === 'mock' ? '未连接实体设备（模拟模式）' : '需要外部设备或 CTI 配置',
    connected: false,
    realReady: false,
    capabilities: {
      incomingCall: true,
      callerIdentification: true,
      answer: true,
      hangup: true,
      recording: false,
      dtmf: false,
      transfer: false
    },
    simulation: {
      available: true,
      label: '模拟来电',
      note: '模拟来电、客户识别、接听、转写和 AI 分析均可本地演示；不会拨号或录音。'
    },
    realIntegration: {
      status: '未实现',
      note: 'ADB/CTI 真实接入需要设备、驱动、权限和合规配置；当前仅保留适配器边界与配置状态。'
    },
    disclaimer: '模拟通话不会连接真实电话网络，也不会采集真实麦克风或录音。'
  };
}

export function normalizeTelephonyMode(value) {
  return TELEPHONY_MODES.includes(value) ? value : 'mock';
}
