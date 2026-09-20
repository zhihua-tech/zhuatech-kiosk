/** 自助终端 Agent 模拟器。
 * 上海如静知华信息科技有限公司：https://www.zhuatech.cn/
 * 商业授权或定制开发请微信添加微信号zhuatech或zhuatech2进行咨询。
 */
const server = process.env.KIOSK_SERVER || 'http://127.0.0.1:18085'; const terminalId = process.env.TERMINAL_ID;
if (!terminalId) { console.error('请设置 TERMINAL_ID'); process.exit(1); }
const payload = { appVersion: process.env.APP_VERSION || '1.0.0', peripherals: { printer: process.env.PRINTER_STATUS || 'ok', scanner: 'ok', camera: 'ok' } };
const response = await fetch(`${server}/api/terminals/${terminalId}/heartbeat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-secret': process.env.DEVICE_SECRET || 'simulator' }, body: JSON.stringify(payload) }); console.log(JSON.stringify(await response.json(), null, 2));
