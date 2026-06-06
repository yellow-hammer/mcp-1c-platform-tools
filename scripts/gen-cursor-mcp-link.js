// Генерирует ссылку установки MCP для Cursor (cursor.com/en/install-mcp).
// Конфиг совпадает с примером ручной настройки в README: ONEC_IPC_HOST, ONEC_IPC_PORT, ONEC_IPC_TOKEN.
// Версия пути берётся из package.json.
// Запуск: node scripts/gen-cursor-mcp-link.js [--write-readme]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version;
const extensionFolder = `yellow-hammer.mcp-1c-platform-tools-${version}-universal`;

const argsPath = [
  '${env:USERPROFILE}',
  '.cursor',
  'extensions',
  extensionFolder,
  'out',
  'src',
  'index.js'
].join('\\');
const readmeArgsPath = argsPath.replaceAll('\\', '\\\\');
const linuxArgsPath = '${env:HOME}/.cursor/extensions/' + extensionFolder + '/out/src/index.js';
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

if (process.argv.includes('--write-readme')) {
  const readmePath = join(rootDir, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const installUrlPattern =
    /https:\/\/cursor\.com\/en\/install-mcp\?name=mcp-1c-platform-tools&config=[^)]+/;
  const windowsArgsPattern =
    /\$\{env:USERPROFILE\}(?:\\{1,2})\.cursor(?:\\{1,2})extensions(?:\\{1,2})(?:yellow-hammer\.mcp-1c-platform-tools-[^"\\]+|\$\{extensionFolder\})(?:\\{1,2})out(?:\\{1,2})src(?:\\{1,2})index\.js/g;
  const linuxArgsPattern =
    /\$\{env:HOME\}\/\.cursor\/extensions\/yellow-hammer\.mcp-1c-platform-tools-[^"/]+\/out\/src\/index\.js/g;

  if (
    !installUrlPattern.test(readme) ||
    !windowsArgsPattern.test(readme) ||
    !linuxArgsPattern.test(readme)
  ) {
    throw new Error('README.md did not contain Cursor MCP install snippets to update');
  }

  const updated = readme
    .replace(installUrlPattern, () => url)
    .replace(windowsArgsPattern, () => readmeArgsPath)
    .replace(linuxArgsPattern, () => linuxArgsPath);

  writeFileSync(readmePath, updated);
}

console.log(url);
