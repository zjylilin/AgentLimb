/**
 * AgentLimb Lite — shared constants
 *
 * Single source of truth for the wire protocol between three peers:
 *   AI agent  ──stdio MCP──  host/bridge-server.mjs  ──HTTP+SSE──  extension SW
 */

export const APP_ID = 'agentlimb.chrome';
export const APP_NAME = 'AgentLimb';
/** Display version. `manifest.json`, `package.json` and the docs mirror these two. */
export const APP_VERSION = '0.8.2';
export const APP_BUILD = 'l22';
export const USER_STOP_MESSAGE = '用户请求停止当前任务：请停止后续浏览器操作，并用 say 回复确认。';

/** Local bridge defaults. The host picks the first free port in the range. */
export const BRIDGE_PORTS = [
  8765, 8766, 8767, 8768, 8769, 8770, 8771, 8772,
  8773, 8774, 8775, 8776, 8777, 8778, 8779, 8780,
];
export const BRIDGE_HOST = '127.0.0.1';
export const BRIDGE_BASE_PORT = 8765;

/**
 * Private range for tests, the bench and the monkey.
 *
 * A real Chrome with the extension loaded scans BRIDGE_PORTS forever. If a test
 * host listened there, that browser would attach to it within a few hundred
 * milliseconds and answer `grant{ok:false}` — which looks exactly like a bug in
 * the code under test. Keeping the two ranges apart makes tests deterministic
 * without weakening what they test.
 */
export const TEST_BRIDGE_PORTS = [
  28765, 28766, 28767, 28768, 28769, 28770, 28771, 28772,
  28773, 28774, 28775, 28776, 28777, 28778, 28779, 28780,
];

/**
 * Host-side override, so a developer can point a real host at another range:
 *   AGENTLIMB_BRIDGE_PORTS=30000,30001 node bin/agentlimb.mjs mcp
 * The extension always scans BRIDGE_PORTS, so only use this for isolated runs.
 */
export function resolveBridgePorts(raw = typeof process === 'undefined' ? null : process.env.AGENTLIMB_BRIDGE_PORTS) {
  if (!raw) return BRIDGE_PORTS;
  const ports = String(raw)
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((port) => Number.isInteger(port) && port > 1024 && port < 65536);
  return ports.length ? ports : BRIDGE_PORTS;
}

/** ~/.agentlimb — stable install location referenced by the copy-prompt. */
export const HOME_DIR_NAME = '.agentlimb';

export const MCP_PROTOCOL_VERSION = '2025-03-26';

/**
 * How long a copied prompt authorizes the next unknown AI client. Copying is
 * the authorization gesture; there is no confirmation page. A client that was
 * authorized once keeps its trust forever and never needs this window again.
 */
export const ONBOARD_WINDOW_MS = 30 * 60 * 1000;

/**
 * Discovery cadence.
 *
 * Pairing feels slow or fast almost entirely because of these two numbers. The
 * full-featured build polled its relay every 300 ms, which is why pairing felt
 * instant; a 2 s discovery loop makes the panel sit on "not connected" long
 * enough for the user to think something is broken. The handshake itself is
 * only a few milliseconds.
 *
 *   HUNT_MS — nothing is connected yet. This IS the first-pairing latency.
 *   IDLE_MS — at least one AI is connected. Tool calls are pushed over the SSE
 *             stream, so this only has to notice a *second* AI starting.
 */
export const DISCOVERY = {
  HUNT_MS: 300,
  IDLE_MS: 1000,
  /** Back-off before re-opening a stream that just errored. */
  RETRY_MS: 400,
  /** A refused localhost port fails immediately; this only bounds a hung one. */
  PROBE_TIMEOUT_MS: 400,
  /** The panel is a live page and cannot be suspended, so it drives the hunt. */
  PANEL_HUNT_MS: 250,
  /** While connected the panel only has to keep the worker from sleeping. */
  PANEL_WARM_MS: 10000,
};

/** chrome.storage.local keys */
export const STORAGE_KEYS = {
  onboardUntil: 'agentlimb.onboardUntil', // epoch ms; while in the future, the next unknown client is trusted
  autoTrust: 'agentlimb.autoTrust', // 默认关闭（false）：新客户端必须通过「复制连接提示词」30分钟窗口授权；显式设为 true 时自动信任本地宿主
  pairedClients: 'agentlimb.pairedClients', // { [clientId]: {id,name,kind,pairedAt} }
  lastClient: 'agentlimb.lastClient',
  hostPath: 'agentlimb.hostPath', // user-overridable MCP command path
  sourcePath: 'agentlimb.sourcePath', // absolute path of the repo that contains bin/agentlimb.mjs
  browserIdentity: 'agentlimb.browserIdentity', // { id, label } per-profile identity for multi-browser routing
  lang: 'agentlimb.lang',
  chatLogs: 'agentlimb.chatLogs', // per-client display-only transcripts
  chatLog: 'agentlimb.chatLog', // recent panel chat (survives panel close / SW restart)
};

/** chrome.runtime message types (panel ↔ SW) */
export const MESSAGE_TYPES = {
  GET_STATUS: 'AGENTLIMB_GET_STATUS',
  // Wake the worker and run one discovery scan. The side panel sends this while
  // it is looking for a bridge, so discovery never depends on the MV3 worker
  // being awake on its own schedule.
  ENSURE: 'AGENTLIMB_ENSURE',
  COPY_PROMPT: 'AGENTLIMB_COPY_PROMPT',
  CANCEL_COPY: 'AGENTLIMB_CANCEL_COPY',
  OPEN_PANEL: 'AGENTLIMB_OPEN_PANEL',
  CHAT_SEND: 'AGENTLIMB_CHAT_SEND',
  CHAT_STOP: 'AGENTLIMB_CHAT_STOP',
  SELECT_CLIENT: 'AGENTLIMB_SELECT_CLIENT',
  DISCONNECT_CLIENT: 'AGENTLIMB_DISCONNECT_CLIENT',
  SET_BROWSER_LABEL: 'AGENTLIMB_SET_BROWSER_LABEL',
  // SW → pages (broadcast)
  NOTIFY_STATUS: 'AGENTLIMB_NOTIFY_STATUS',
  NOTIFY_CHAT: 'AGENTLIMB_NOTIFY_CHAT',
};

/**
 * Wire protocol over the local bridge (SSE host→ext, POST ext→host).
 * Every frame is JSON: { t: <type>, ... }.
 *
 * Handshake: the host says HELLO, and the extension answers GRANT once it has
 * decided whether this client may drive the browser. There is no browser-side
 * approval page — the decision is trust saved from an earlier session, or the
 * 30-minute window opened by clicking Copy in the side panel.
 */
export const WIRE = {
  // host → extension (SSE)
  HELLO: 'hello', // {t, client:{id,name,kind}, bridgeVersion}
  TOOL_CALL: 'tool_call', // {t, tool_use_id, tool, args, tabId?}
  AGENT_MESSAGE: 'agent_message', // {t, text, at}  (agent → panel chat)
  PING: 'ping',
  // extension → host (POST /api/message)
  GRANT: 'grant', // {t, ok, name?, reason?}  answer to HELLO
  REVOKED: 'revoked', // {t, client_id}  the user removed this AI in the panel
  TOOL_RESULT: 'tool_result', // {t, tool_use_id, ok, result?, error?, userMessages?}
  PONG: 'pong',
  USER_MESSAGE: 'user_message', // {t, text, at, page?}  (panel chat → agent)
};

export const CAPABILITIES = [
  'browser_host',
  'computer_control',
  'page_snapshot',
  'tab_management',
  'mcp_bridge',
];

/**
 * 浏览器域名访问安全策略（默认黑名单模式）：
 * - allowedDomains 保持为空数组 []，代表除黑名单外的所有常规网站与自媒体分发平台（如公众号 mp.weixin.qq.com、小红书、抖音、B站、知乎等）均直接放行，新增平台无需改代码。
 * - blockedDomains 封锁网银、支付、私人邮箱与云服务器控制台（自动匹配主域名及其所有子域名）。
 */
export const DOMAIN_POLICY = {
  allowedDomains: [],
  blockedDomains: [
    // 1. 国内各大网银与金融机构
    'icbc.com.cn',
    'ccb.com',
    'abchina.com',
    '95599.cn',
    'boc.cn',
    'bankcomm.com',
    'cmbchina.com',
    'psbc.com',
    'spdb.com.cn',
    'cib.com.cn',
    'citicbank.com',
    'cmbc.com.cn',
    'cebbank.com',
    'bank.pingan.com',
    'hxb.com.cn',
    'cgbchina.com.cn',
    '95516.com',
    'unionpay.com',
    // 2. 国际银行、券商与加密资产交易平台
    'hsbc.com',
    'citibank.com',
    'chase.com',
    'bankofamerica.com',
    'wellsfargo.com',
    'binance.com',
    'okx.com',
    'coinbase.com',
    // 3. 支付与钱包平台（精确封锁 pay.weixin.qq.com，不影响公众号 mp.weixin.qq.com 和视频号 channels.weixin.qq.com）
    'alipay.com',
    'pay.weixin.qq.com',
    'tenpay.com',
    'paypal.com',
    'stripe.com',
    'wise.com',
    // 4. 私人与企业邮箱
    'mail.google.com',
    'outlook.live.com',
    'outlook.office.com',
    'outlook.office365.com',
    'mail.qq.com',
    'exmail.qq.com',
    'mail.163.com',
    'mail.126.com',
    'yeah.net',
    'mail.aliyun.com',
    'mail.sina.com.cn',
    'mail.sohu.com',
    'mail.10086.cn',
    'mail.189.cn',
    'proton.me',
    'protonmail.com',
    // 5. 云服务器与基础设施管理控制台
    'console.aliyun.com',
    'account.aliyun.com',
    'ram.console.aliyun.com',
    'ecs.console.aliyun.com',
    'console.cloud.tencent.com',
    'console.huaweicloud.com',
    'console.bce.baidu.com',
    'console.volcengine.com',
    'portal.qiniu.com',
    'console.aws.amazon.com',
    'signin.aws.amazon.com',
    'console.cloud.google.com',
    'portal.azure.com',
    'dash.cloudflare.com',
    'cloud.digitalocean.com',
  ],
};

// 判断主机名是否命中域名规则列表（精确匹配或作为子域名匹配）
export function matchDomainList(hostname, list) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!host || !Array.isArray(list)) return null;
  for (const raw of list) {
    const rule = String(raw || '').trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!rule) continue;
    if (host === rule || host.endsWith(`.${rule}`)) return rule;
  }
  return null;
}

// 检查指定 URL 是否被域名黑名单（或非空时的白名单）拦截
export function isBlockedUrl(rawUrl, policy = DOMAIN_POLICY) {
  const str = String(rawUrl || '').trim();
  if (!str || str === 'about:blank') return false;
  let hostname = '';
  try {
    hostname = new URL(str).hostname;
  } catch (_) {
    return false;
  }
  if (!hostname) return false;
  const blockedRule = matchDomainList(hostname, policy?.blockedDomains);
  if (blockedRule) return true;
  if (Array.isArray(policy?.allowedDomains) && policy.allowedDomains.length > 0) {
    return !matchDomainList(hostname, policy.allowedDomains);
  }
  return false;
}

// 断言目标 URL 允许被 AI 访问或操控，若命中黑名单则直接抛出拦截错误
export function assertAllowedUrl(rawUrl, policy = DOMAIN_POLICY) {
  const str = String(rawUrl || '').trim();
  if (!str || str === 'about:blank') return;
  let hostname = '';
  try {
    hostname = new URL(str).hostname;
  } catch (_) {
    return;
  }
  if (!hostname) return;
  const blockedRule = matchDomainList(hostname, policy?.blockedDomains);
  if (blockedRule) {
    throw new Error(`Blocked by domain policy: "${hostname}" matches blocked domain "${blockedRule}" (banking, payment, private email, or cloud console).`);
  }
  if (Array.isArray(policy?.allowedDomains) && policy.allowedDomains.length > 0 && !matchDomainList(hostname, policy.allowedDomains)) {
    throw new Error(`Blocked by domain policy: "${hostname}" is not in allowedDomains.`);
  }
}

