# MCP-сервер для 1C: Platform tools

MCP-сервер предоставляет инструменты Model Context Protocol для запуска команд расширения [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) через агентов Cursor/VS Code.

## Быстрый старт

1. Установите расширение [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) и **MCP 1C Platform Tools** (из VS Code Marketplace или Open VSX).
2. Включите IPC: настройка `1c-platform-tools.ipc.enabled` = `true`.
3. Откройте проект 1С (папка с `packagedef`).

В **VS Code** MCP регистрируется расширением автоматически: после установки и включения IPC ничего настраивать не нужно.

В **Cursor** на данный момент не поддерживается API регистрации MCP через расширения, поэтому сервер не появляется в «Installed MCP Servers». Варианты:

- **Через каталог MCP (рекомендуется):** после публикации сервера в [MCP Registry](https://registry.modelcontextprotocol.io) его можно добавить в Cursor из каталога (как другие MCP) — тогда не нужен ручной путь в `mcp.json`. Инструкция по публикации в каталог: [MCP_REGISTRY_PUBLISH.md](MCP_REGISTRY_PUBLISH.md).
- **Вручную:** добавьте сервер в `mcp.json`, как описано ниже.

1. Создайте или откройте файл конфигурации MCP:
   - глобально: `~/.cursor/mcp.json` (в Windows: `%USERPROFILE%\.cursor\mcp.json`);
   - в проекте: `.cursor/mcp.json` в корне проекта.
2. Укажите сервер в формате ниже. В пути к расширению можно использовать переменные окружения: в Cursor в `mcp.json` поддерживается подстановка `${env:ИМЯ}` (например `${env:USERPROFILE}` в Windows или `${env:HOME}` в macOS/Linux). Папку расширения можно посмотреть в Cursor: расширения → MCP 1C Platform Tools → правый клик → «Copy Extension Path».

**Пример (Windows, путь через домашнюю папку):**

```json
{
  "mcpServers": {
    "mcp-1c-platform-tools": {
      "command": "node",
      "args": ["${env:USERPROFILE}\\.cursor\\extensions\\yellow-hammer.mcp-1c-platform-tools-0.1.0\\out\\src\\index.js"],
      "env": {
        "ONEC_IPC_PORT": "порт из 1c-platform-tools.ipc.port",
        "ONEC_IPC_TOKEN": "токен из 1c-platform-tools.ipc.token (если задан)"
      }
    }
  }
}
```

**macOS/Linux:** замените путь на `"${env:HOME}/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.0/out/src/index.js"` (подставьте свою версию вместо `0.1.0`). После обновления расширения версия в имени папки может измениться — тогда обновите путь в конфиге.

Убедитесь, что расширение **1c-platform-tools** установлено, IPC включён (`1c-platform-tools.ipc.enabled` = true) и в настройках расширения указаны те же порт и токен, что в `env`.

## Общие параметры инструментов

Все MCP-инструменты принимают единый набор параметров:

| Параметр        | Обязательный | Описание                                                                            |
|-----------------|:------------:|-------------------------------------------------------------------------------------|
| `projectPath`   |      да      | Абсолютный путь к корню проекта 1С (где лежат `packagedef` и `env.json`)            |
| `settingsFile`  |     нет      | Путь к `env.json` относительно `projectPath` (по умолчанию `env.json`)              |
| `ibConnection`  |     нет      | Строка подключения к ИБ; если не указана, берётся из `env.json` или `/F./build/ib`  |
| `pathsOverride` |     нет      | Переопределение путей (`cf`, `out`, `cfe`, `epf`, `erf`) относительно `projectPath` |

Результат каждого инструмента — текстовое сообщение (например, `Выполнено.` или описание ошибки).

## Типичный сценарий с агентом

1. Агент изменяет исходники проекта 1С (например, в `src/cf` или `src/cfe`).
2. Агент вызывает MCP-инструмент (`configuration_loadFromSrc`, `extensions_loadFromSrc` и т.д.).
3. MCP отправляет запрос расширению по IPC; расширение выполняет команду (vrunner) и возвращает результат.

## Для разработчиков

Сборка из исходников и участие в разработке — см. [CONTRIBUTING.md](CONTRIBUTING.md).
