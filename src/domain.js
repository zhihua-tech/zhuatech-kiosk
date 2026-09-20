/**
 * 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
import crypto from 'node:crypto';
const id = (prefix) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
const now = () => new Date().toISOString();
const required = (value, name) => { if (value === undefined || value === null || String(value).trim() === '') throw new Error(`${name}不能为空`); return String(value).trim(); };

/** 自助终端全生命周期服务：注册、策略、应用发布、运维命令、外设健康与事件。 */
export class KioskService {
  constructor(seed = {}) {
    this.terminals = new Map((seed.terminals || []).map((x) => [x.id, x]));
    this.policies = new Map((seed.policies || []).map((x) => [x.id, x]));
    this.releases = new Map((seed.releases || []).map((x) => [x.id, x]));
    this.deployments = new Map((seed.deployments || []).map((x) => [x.id, x]));
    this.commands = new Map((seed.commands || []).map((x) => [x.id, x]));
    this.commandKeys = new Map(seed.commandKeys || []);
    this.incidents = new Map((seed.incidents || []).map((x) => [x.id, x]));
    this.audit = seed.audit || [];
  }

  /** 注册终端并签发仅返回一次的设备密钥。 */
  enrollTerminal(input, actor = 'admin') {
    const code = required(input.code, '终端编号');
    if ([...this.terminals.values()].some((x) => x.code === code)) throw new Error('终端编号已存在');
    const secret = crypto.randomBytes(24).toString('base64url');
    const terminal = { id: id('ter'), code, name: required(input.name, '终端名称'), site: required(input.site, '场所'), model: input.model || 'generic-x86', tags: input.tags || [], status: 'offline', appVersion: null, policyId: null, peripherals: {}, lastSeenAt: null, secretHash: crypto.createHash('sha256').update(secret).digest('hex'), createdAt: now() };
    this.terminals.set(terminal.id, terminal); this.#audit(actor, 'TERMINAL_ENROLLED', terminal.id, { code });
    return { terminal: structuredClone(terminal), secret };
  }

  /** 创建锁屏、安全和维护窗口策略。 */
  createPolicy(input, actor = 'security-admin') {
    const allowedOrigins = input.allowedOrigins || [];
    if (!allowedOrigins.length) throw new Error('至少配置一个允许访问的来源');
    const policy = { id: id('pol'), name: required(input.name, '策略名称'), allowedOrigins, usbDisabled: input.usbDisabled !== false, idleTimeoutSeconds: Math.max(30, Number(input.idleTimeoutSeconds || 180)), maintenanceWindow: input.maintenanceWindow || '02:00-04:00', revision: Date.now(), createdAt: now() };
    this.policies.set(policy.id, policy); this.#audit(actor, 'POLICY_CREATED', policy.id, {}); return structuredClone(policy);
  }

  /** 给终端绑定策略。 */
  assignPolicy(terminalId, policyId, actor = 'security-admin') {
    const terminal = this.#terminal(terminalId); if (!this.policies.has(policyId)) throw new Error('策略不存在');
    terminal.policyId = policyId; this.#audit(actor, 'POLICY_ASSIGNED', terminalId, { policyId }); return structuredClone(terminal);
  }

  /** 登记带内容校验值的终端应用版本。 */
  createRelease(input, actor = 'release-manager') {
    const version = required(input.version, '版本号'); const packageUrl = required(input.packageUrl, '安装包地址');
    const checksum = input.checksum || crypto.createHash('sha256').update(packageUrl).digest('hex');
    if (!/^[a-f0-9]{64}$/i.test(checksum)) throw new Error('SHA-256 校验值无效');
    const release = { id: id('rel'), version, packageUrl, checksum, notes: input.notes || '', status: 'ready', createdAt: now() };
    this.releases.set(release.id, release); this.#audit(actor, 'RELEASE_CREATED', release.id, { version }); return structuredClone(release);
  }

  /** 创建按批次推进的应用发布任务。 */
  createDeployment(input, actor = 'release-manager') {
    if (!this.releases.has(input.releaseId)) throw new Error('版本不存在');
    const targets = input.terminalIds || [];
    if (!targets.length) throw new Error('发布终端不能为空');
    targets.forEach((x) => this.#terminal(x));
    const deployment = { id: id('dep'), name: required(input.name, '发布名称'), releaseId: input.releaseId, terminalIds: targets, batchSize: Math.max(1, Number(input.batchSize || 1)), cursor: 0, results: {}, status: 'running', createdAt: now() };
    this.deployments.set(deployment.id, deployment); this.#audit(actor, 'DEPLOYMENT_CREATED', deployment.id, { targets: targets.length }); return structuredClone(deployment);
  }

  /** 取得下一批待升级终端，支持灰度发布。 */
  nextDeploymentBatch(deploymentId) {
    const deployment = this.deployments.get(deploymentId); if (!deployment) throw new Error('发布任务不存在');
    if (deployment.status === 'completed') return [];
    const batch = deployment.terminalIds.slice(deployment.cursor, deployment.cursor + deployment.batchSize); deployment.cursor += batch.length;
    if (deployment.cursor >= deployment.terminalIds.length) deployment.status = 'awaiting-results';
    return batch;
  }

  /** 上报发布结果，全部成功或失败后结束任务。 */
  reportDeployment(deploymentId, terminalId, success, detail = '') {
    const deployment = this.deployments.get(deploymentId); if (!deployment || !deployment.terminalIds.includes(terminalId)) throw new Error('发布任务或终端不匹配');
    deployment.results[terminalId] = { success: Boolean(success), detail, reportedAt: now() };
    if (Object.keys(deployment.results).length === deployment.terminalIds.length) deployment.status = Object.values(deployment.results).every((x) => x.success) ? 'completed' : 'completed_with_errors';
    if (success) this.terminals.get(terminalId).appVersion = this.releases.get(deployment.releaseId).version;
    return structuredClone(deployment);
  }

  /** 接收终端心跳，发现外设异常时自动建立事件。 */
  heartbeat(terminalId, input) {
    const terminal = this.#terminal(terminalId); terminal.status = 'online'; terminal.lastSeenAt = now(); terminal.appVersion = input.appVersion || terminal.appVersion; terminal.peripherals = input.peripherals || {};
    for (const [name, state] of Object.entries(terminal.peripherals)) {
      if (state !== 'ok' && ![...this.incidents.values()].some((x) => x.terminalId === terminalId && x.source === name && x.status === 'open')) {
        const incident = { id: id('inc'), terminalId, source: name, severity: state === 'offline' ? 'critical' : 'warning', summary: `${name} 状态异常: ${state}`, status: 'open', openedAt: now() };
        this.incidents.set(incident.id, incident); this.#audit('health-engine', 'INCIDENT_OPENED', incident.id, { terminalId });
      }
    }
    return { policy: terminal.policyId ? this.policies.get(terminal.policyId) : null, commands: [...this.commands.values()].filter((x) => x.terminalId === terminalId && x.status === 'approved') };
  }

  /** 创建高风险远程命令；重启、清缓存等命令必须审批后下发。 */
  requestCommand(terminalId, input, actor = 'operator', idempotencyKey = '') {
    this.#terminal(terminalId); if (idempotencyKey && this.commandKeys.has(idempotencyKey)) return structuredClone(this.commands.get(this.commandKeys.get(idempotencyKey)));
    const allowed = ['restart-app', 'reboot-os', 'clear-cache', 'collect-logs']; const name = required(input.name, '命令名称'); if (!allowed.includes(name)) throw new Error('命令不在允许清单');
    const command = { id: id('cmd'), terminalId, name, reason: required(input.reason, '操作原因'), requestedBy: actor, approvedBy: null, status: name === 'collect-logs' ? 'approved' : 'pending_approval', createdAt: now() };
    this.commands.set(command.id, command); if (idempotencyKey) this.commandKeys.set(idempotencyKey, command.id); this.#audit(actor, 'COMMAND_REQUESTED', command.id, { name }); return structuredClone(command);
  }

  /** 审批高风险远程命令，申请人不能自审。 */
  approveCommand(commandId, approver) {
    const command = this.commands.get(commandId); if (!command || command.status !== 'pending_approval') throw new Error('命令状态不允许审批'); if (command.requestedBy === approver) throw new Error('申请人不能审批自己的命令');
    command.status = 'approved'; command.approvedBy = approver; command.approvedAt = now(); this.#audit(approver, 'COMMAND_APPROVED', command.id, {}); return structuredClone(command);
  }

  /** 返回管理驾驶舱。 */
  dashboard() {
    const terminals = [...this.terminals.values()]; const incidents = [...this.incidents.values()];
    return { metrics: { terminals: terminals.length, online: terminals.filter((x) => x.status === 'online').length, incidents: incidents.filter((x) => x.status === 'open').length, deployments: this.deployments.size, pendingCommands: [...this.commands.values()].filter((x) => x.status === 'pending_approval').length }, terminals, incidents, deployments: [...this.deployments.values()], commands: [...this.commands.values()], audit: this.audit.slice(-20).reverse() };
  }

  dump() { return { terminals: [...this.terminals.values()], policies: [...this.policies.values()], releases: [...this.releases.values()], deployments: [...this.deployments.values()], commands: [...this.commands.values()], commandKeys: [...this.commandKeys.entries()], incidents: [...this.incidents.values()], audit: this.audit }; }
  #terminal(idValue) { const terminal = this.terminals.get(idValue); if (!terminal) throw new Error('终端不存在'); return terminal; }
  #audit(actor, action, resourceId, detail) { this.audit.push({ id: id('aud'), actor, action, resourceId, detail, occurredAt: now() }); }
}

/** 创建覆盖策略、版本、发布、健康与审批的演示数据。 */
export function demoService() {
  const service = new KioskService(); const a = service.enrollTerminal({ code: 'KIOSK-SH-001', name: '上海总部访客机', site: '总部一楼', model: 'ZT-K24', tags: ['visitor'] }).terminal; const b = service.enrollTerminal({ code: 'KIOSK-SH-002', name: '园区服务终端', site: 'A座大厅', model: 'ZT-K32', tags: ['service'] }).terminal;
  const policy = service.createPolicy({ name: '访客终端安全基线', allowedOrigins: ['https://visitor.example.com'], idleTimeoutSeconds: 120 }); service.assignPolicy(a.id, policy.id); service.assignPolicy(b.id, policy.id);
  const release = service.createRelease({ version: '1.4.0', packageUrl: 'https://downloads.example.com/kiosk-1.4.0.zip' }); const deployment = service.createDeployment({ name: '访客应用 1.4 灰度', releaseId: release.id, terminalIds: [a.id, b.id], batchSize: 1 }); service.nextDeploymentBatch(deployment.id); service.reportDeployment(deployment.id, a.id, true, '校验通过');
  service.heartbeat(a.id, { appVersion: '1.4.0', peripherals: { printer: 'ok', scanner: 'ok', camera: 'ok' } }); service.heartbeat(b.id, { appVersion: '1.3.2', peripherals: { printer: 'paper-low', scanner: 'ok', camera: 'ok' } });
  const command = service.requestCommand(b.id, { name: 'reboot-os', reason: '维护窗口重启' }, 'operator-a'); service.approveCommand(command.id, 'supervisor-b'); return service;
}
