# Публикация MCP 1C Platform Tools в MCP Registry

После публикации сервер появится в [официальном каталоге MCP](https://registry.modelcontextprotocol.io) и его можно будет добавлять в Cursor (и другие клиенты) как остальные MCP — без ручного прописывания пути в `mcp.json`.

## Требования

- Аккаунт [npm](https://www.npmjs.com/) (для публикации пакета)
- Аккаунт [GitHub](https://github.com/) (для аутентификации в MCP Registry)
- Установленный [mcp-publisher](https://github.com/modelcontextprotocol/registry#mcp-publisher) (CLI)

### Публикация в npm и 2FA

Для публикации пакетов npm требует **двухфакторную аутентификацию (2FA)** или токен с правом обхода 2FA:

- **Интерактивная публикация:** включите 2FA в [настройках npm](https://www.npmjs.com/settings/~/account) (Account → Two-Factor Authentication). При `npm publish` будет запрошен одноразовый код (OTP).
- **Токен для CI/автоматизации:** в npm создайте [Granular Access Token](https://www.npmjs.com/settings/~/tokens) с правами «Publish» и при создании отметьте **«Bypass two-factor authentication»** (иначе при публикации получите 403).

## Шаги

### 1. Сборка

```bash
npm run build
```

Убедитесь, что в `out/src/` есть `index.js` (standalone MCP-сервер) и `extension.js` (расширение VS Code).

### 2. Публикация в npm

MCP Registry хранит только метаданные; сам пакет должен быть в npm. Пакет публикуется под организацией [yellow-hammer](https://www.npmjs.com/settings/yellow-hammer/packages) (scope `@yellow-hammer`).

```bash
# При первом разе: npm adduser (или добавьте пользователя в организацию yellow-hammer)
npm publish --access public
```

Для scoped-пакетов (`@yellow-hammer/...`) флаг `--access public` обязателен, иначе пакет будет приватным. Поле `mcpName` в `package.json` должно совпадать с `name` в `server.json` (`io.github.yellow-hammer/mcp-1c-platform-tools`). При смене версии обновите `version` и в `package.json`, и в `server.json`.

### 3. Установка mcp-publisher

**Windows (PowerShell):**

```powershell
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
tar xf mcp-publisher.tar.gz mcp-publisher.exe
# Переместите mcp-publisher.exe в каталог из PATH
```

**macOS / Linux:** см. [документацию MCP Registry](https://modelcontextprotocol.io/registry/quickstart).

### 4. Аутентификация в MCP Registry

```bash
mcp-publisher login github
```

Следуйте инструкциям в браузере (Device Flow). Имя сервера в Registry должно начинаться с `io.github.<ваш-github-username>/` — в нашем случае `io.github.yellow-hammer/`.

### 5. Публикация в MCP Registry

В корне репозитория (рядом с `server.json`):

```bash
mcp-publisher publish
```

Проверка: запрос к API каталога:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=mcp-1c-platform-tools"
```

## После публикации

- В Cursor при добавлении MCP через каталог или «Add MCP» пользователь сможет выбрать **MCP 1C Platform Tools**; клиент подставит команду `npx mcp-1c-platform-tools` и запросит переменные окружения (порт IPC, токен).
- Расширение **1c-platform-tools** должно быть установлено, IPC включён (`1c-platform-tools.ipc.enabled` = true), порт и токен в настройках расширения должны совпадать с теми, что пользователь укажет для MCP.

## Обновление версии

1. Обновить `version` в `package.json` и `server.json`.
2. `npm run build` → `npm publish --access public`.
3. `mcp-publisher publish`.
