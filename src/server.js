/**
 * 上海如静知华信息科技有限公司 https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KioskService, demoService } from './domain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = path.resolve(process.env.KIOSK_DATA_FILE || './data/kiosk.json');
const apiKey = process.env.KIOSK_API_KEY || 'zhuatech-demo-key';
const port = Number(process.env.PORT || 18085);
let service;
try { service = new KioskService(JSON.parse(fs.readFileSync(dataFile, 'utf8'))); } catch { service = demoService(); }

const save = () => {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(service.dump(), null, 2));
};
save();

const send = (res, status, value, type = 'application/json; charset=utf-8') => {
  const responseBody = type.startsWith('application/json') ? JSON.stringify(value) : value;
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(responseBody);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (raw.length > 1048576) throw new Error('请求体过大');
  return raw.length ? JSON.parse(raw) : {};
};

const handleApi = async (req, res, url) => {
  if (req.method === 'GET' && url.pathname === '/api/dashboard') return send(res, 200, service.dashboard());
  if (req.method === 'POST' && url.pathname === '/api/terminals') {
    const result = service.enrollTerminal(await readBody(req), req.headers['x-actor'] || 'admin'); save(); return send(res, 201, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/policies') {
    const result = service.createPolicy(await readBody(req), req.headers['x-actor'] || 'security-admin'); save(); return send(res, 201, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/releases') {
    const result = service.createRelease(await readBody(req), req.headers['x-actor'] || 'release-manager'); save(); return send(res, 201, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/deployments') {
    const result = service.createDeployment(await readBody(req), req.headers['x-actor'] || 'release-manager'); save(); return send(res, 201, result);
  }

  let match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/policy$/);
  if (req.method === 'PUT' && match) {
    const input = await readBody(req); const result = service.assignPolicy(match[1], input.policyId, req.headers['x-actor'] || 'security-admin'); save(); return send(res, 200, result);
  }
  match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/heartbeat$/);
  if (req.method === 'POST' && match) {
    const result = service.heartbeat(match[1], await readBody(req)); save(); return send(res, 200, result);
  }
  match = url.pathname.match(/^\/api\/terminals\/([^/]+)\/commands$/);
  if (req.method === 'POST' && match) {
    const result = service.requestCommand(match[1], await readBody(req), req.headers['x-actor'] || 'operator', req.headers['idempotency-key'] || ''); save(); return send(res, 201, result);
  }
  match = url.pathname.match(/^\/api\/commands\/([^/]+)\/approve$/);
  if (req.method === 'POST' && match) {
    const input = await readBody(req); const result = service.approveCommand(match[1], input.approver); save(); return send(res, 200, result);
  }
  match = url.pathname.match(/^\/api\/deployments\/([^/]+)\/next$/);
  if (req.method === 'POST' && match) {
    const result = service.nextDeploymentBatch(match[1]); save(); return send(res, 200, { terminalIds: result });
  }
  match = url.pathname.match(/^\/api\/deployments\/([^/]+)\/results$/);
  if (req.method === 'POST' && match) {
    const input = await readBody(req); const result = service.reportDeployment(match[1], input.terminalId, input.success, input.detail || ''); save(); return send(res, 200, result);
  }
  return send(res, 404, { error: 'NOT_FOUND' });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/') return send(res, 200, fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    if (url.pathname === '/terminal') return send(res, 200, fs.readFileSync(path.join(root, 'web', 'terminal.html'), 'utf8'), 'text/html; charset=utf-8');
    if (url.pathname === '/health') return send(res, 200, { status: 'UP' });
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'NOT_FOUND' });
    if (req.headers['x-api-key'] !== apiKey && !req.headers['x-device-secret']) return send(res, 401, { error: 'UNAUTHORIZED' });
    return await handleApi(req, res, url);
  } catch (error) {
    return send(res, 400, { error: 'BUSINESS_ERROR', message: error.message });
  }
});

server.listen(port, () => console.log(`ZhuaTech Kiosk running at http://127.0.0.1:${port}`));
