# Публикация MCP 1C Platform Tools (npm + MCP Registry)

Краткая шпаргалка по тому, что настроено и как публиковать.

## Что сделано

- **npm:** пакет `@yellow-hammer/mcp-1c-platform-tools`, запуск через `npx @yellow-hammer/mcp-1c-platform-tools`.
- **MCP Registry:** сервер в каталоге под именем `io.github.yellow-hammer/mcp-1c-platform-tools` (или `io.github.johnnyshut/...` при публикации от личного аккаунта).
- **Точка входа для npx:** корневой `run-mcp.js` (без слэшей в пути, иначе npm при публикации убирает `bin`).

## Важные файлы и поля

| Файл / поле                                        | Назначение                                                                                                                   |
|----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------|
| `package.json` → `name`                            | `@yellow-hammer/mcp-1c-platform-tools` (scope организации npm).                                                              |
| `package.json` → `bin`                             | `"./run-mcp.js"` — команда для npx.                                                                                          |
| `package.json` → `mcpName`                         | Имя в MCP Registry: `io.github.yellow-hammer/mcp-1c-platform-tools`. Должно совпадать с правом публикации (GitHub user/org). |
| `package.json` → `files`                           | Что попадает в npm: `run-mcp.js`, `out`, `resources`, `package.json`, `README.md`, `LICENSE`.                                |
| `server.json` → `name`                             | То же, что `mcpName` в package.json.                                                                                         |
| `server.json` → `description`                      | Не длиннее **100 символов** (лимит Registry).                                                                                |
| `server.json` → `packages[0].identifier`           | `@yellow-hammer/mcp-1c-platform-tools`.                                                                                      |
| `server.json` → `packages[0].environmentVariables` | `ONEC_IPC_PORT` (обязателен), `ONEC_IPC_TOKEN` (опционально).                                                                |

Версию при релизе меняют **и** в `package.json`, **и** в `server.json` (в двух местах: верхний `version` и `packages[0].version`).

## Публикация в npm

1. `npm run build`
2. Включена 2FA в npm или используется токен с правом «Bypass 2FA».
3. Пользователь входит в организацию **yellow-hammer** в npm с правом публикации.
4. В каталоге проекта: `npm publish --access public` (для scoped-пакета `--access public` обязателен).

## Публикация в MCP Registry

1. Установлен [mcp-publisher](https://github.com/modelcontextprotocol/registry/releases) (бинарник в PATH или в каталоге проекта).
2. **Право на имя:** при имени `io.github.yellow-hammer/...` членство в организации yellow-hammer на GitHub должно быть **публичным** (Organizations → yellow-hammer → People → у своего логина видимость **Public**). Иначе — использовать `io.github.johnnyshut/...` и тот же `mcpName` в package.json.
3. В каталоге проекта: `mcp-publisher login github` (при истечении токена — повторить).
4. Затем: `mcp-publisher publish`.

Registry проверяет, что в **опубликованном** npm-пакете поле `mcpName` совпадает с именем в `server.json` и с аккаунтом, под которым вы вошли. Поэтому после смены `mcpName` нужна новая версия пакета в npm, затем публикация в Registry.

## Что не коммитить

- `.mcpregistry_github_token`, `.mcpregistry_registry_token` — токены авторизации.
- `mcp-publisher.exe` — локальная копия бинарника.

Всё перечислено в `.gitignore`.

## Cursor: как подключают MCP

- **Из каталога (после публикации в Registry):** добавить сервер через интерфейс MCP (если клиент поддерживает Registry).
- **Вручную в `mcp.json`:** команда `node`, аргумент — путь к `out/src/index.js` установленного расширения или `npx @yellow-hammer/mcp-1c-platform-tools`; в `env` указать `ONEC_IPC_PORT` и при необходимости `ONEC_IPC_TOKEN` (те же значения, что в настройках расширения 1c-platform-tools).

Подробнее про ручную настройку и переменные окружения — в корневом `README.md`.

---

## Ручная публикация (по шагам)

Порядок: сначала npm, затем MCP Registry (Registry проверяет пакет на npm).

### 1. Обновить версию

В `package.json` и в `server.json` (два поля: `version` и `packages[0].version`) выставить одну и ту же версию, например `0.1.3`.

### 2. Публикация в npm

```bash
npm run build
npm publish --access public
```

- Нужны права на публикацию в организацию **yellow-hammer** в npm.
- Если включена 2FA в npm — при `npm publish` будет запрошен OTP. Либо создайте [токен](https://www.npmjs.com/settings/~/tokens) с **Bypass two-factor authentication** и используйте `npm login` (логин + пароль + токен вместо пароля).

### 3. Публикация в MCP Registry

```bash
mcp-publisher login github   # при истечении токена — выполнить снова
mcp-publisher publish
```

- Установленный [mcp-publisher](https://github.com/modelcontextprotocol/registry/releases) в PATH или в каталоге проекта.
- Для имени `io.github.yellow-hammer/...` членство в организации yellow-hammer на GitHub должно быть **публичным** (см. выше в разделе «Публикация в MCP Registry»).
