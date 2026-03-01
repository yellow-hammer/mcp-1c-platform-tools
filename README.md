# MCP-сервер для 1C: Platform tools

MCP-сервер предоставляет инструменты Model Context Protocol для запуска команд расширения [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) через агентов Cursor/VS Code.

## Быстрый старт

1. Установите расширение [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) и расширение **MCP 1C Platform Tools**.
2. Включите IPC: настройка `1c-platform-tools.ipc.enabled` = `true`.
3. Откройте проект 1С (папка с `packagedef`).

В **VS Code** MCP регистрируется расширением автоматически: после установки и включения IPC ничего настраивать не нужно.

Если MCP не подхватился автоматически (например в Cursor), добавьте сервер вручную — см. раздел ниже.

## Добавление MCP вручную через файл

Конфиг MCP можно положить **в проект** (тогда он действует только при открытии этого проекта) или **глобально** (для всех проектов).

### Файл в проекте (рекомендуется)

1. В **корне проекта 1С** (папка с `packagedef`) создайте папку `.cursor`, если её нет.
2. Создайте или откройте файл **`.cursor/mcp.json`** в этом корне.
3. Вставьте конфиг ниже (в пути — версия расширения, в `env` — порт и токен из настроек 1c-platform-tools).
4. Перезагрузите окно (Ctrl+Shift+P → «Developer: Reload Window»).

**Пример для проекта (Windows):**

```json
{
  "mcpServers": {
    "mcp-1c-platform-tools": {
      "command": "node",
      "args": ["${env:USERPROFILE}\\.cursor\\extensions\\yellow-hammer.mcp-1c-platform-tools-0.1.0\\out\\src\\index.js"],
      "env": {
        "ONEC_IPC_HOST": "127.0.0.1",
        "ONEC_IPC_PORT": "40241",
        "ONEC_IPC_TOKEN": ""
      }
    }
  }
}
```

**macOS/Linux:** в `args` — `"${env:HOME}/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.0/out/src/index.js"` (подставьте версию).

### Глобальный файл

Вместо файла в проекте можно использовать один конфиг для всех проектов:

- **Windows:** `%USERPROFILE%\.cursor\mcp.json`
- **macOS/Linux:** `~/.cursor/mcp.json`

Структура `mcpServers` та же. После изменений перезагрузите окно Cursor.

---

Убедитесь, что расширение **1c-platform-tools** установлено, IPC включён (`1c-platform-tools.ipc.enabled` = true) и в настройках указаны те же порт и токен, что в `env` конфига MCP.
