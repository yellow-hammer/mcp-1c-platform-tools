// Генерирует ссылку установки MCP для Cursor (cursor.com/en/install-mcp).
// Конфиг совпадает с примером ручной настройки в README: ONEC_IPC_HOST, ONEC_IPC_PORT, ONEC_IPC_TOKEN.
// Версия пути берётся из package.json. Запуск: node scripts/gen-cursor-mcp-link.js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const version = pkg.version;

const argsPath = '${env:USERPROFILE}\\.cursor\\extensions\\yellow-hammer.mcp-1c-platform-tools-' + version + '\\out\\src\\index.js';
const config = {
  command: 'node',
  args: [argsPath],
  env: {
    ONEC_IPC_HOST: '127.0.0.1',
    ONEC_IPC_PORT: '40241',
    ONEC_IPC_TOKEN: ''
  }
};

const b64 = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
const url = `https://cursor.com/en/install-mcp?name=mcp-1c-platform-tools&config=${encodeURIComponent(b64)}`;
console.log(url);
