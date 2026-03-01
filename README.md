# MCP-сервер для 1C: Platform tools

[![OpenYellow](https://openyellow.openintegrations.dev/data/badges/1160221881.png)](https://openyellow.org/grid?filter=top&repo=1160221881)

MCP-сервер предоставляет инструменты Model Context Protocol для запуска команд расширения [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) через агентов Cursor/VS Code.

## Быстрый старт

1. Установите расширение [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) и расширение **MCP 1C Platform Tools**.
2. Включите IPC: настройка `1c-platform-tools.ipc.enabled` = `true`.
3. Откройте проект 1С (папка с `packagedef`).

В **VS Code** дополнительная настройка не нужна: расширение само регистрирует MCP. Достаточно установить оба расширения и включить IPC.

В **Cursor** расширение не может прописать MCP в настройки, поэтому конфиг нужно добавить вручную. Варианты:

- **Кнопка:** [![Add MCP 1C Platform Tools to Cursor](resources/mcp-install-dark.png)](https://cursor.com/en/install-mcp?name=mcp-1c-platform-tools&config=eyJjb21tYW5kIjoibm9kZSIsImFyZ3MiOlsiJHtlbnY6VVNFUlBST0ZJTEV9XFwuY3Vyc29yXFxleHRlbnNpb25zXFx5ZWxsb3ctaGFtbWVyLm1jcC0xYy1wbGF0Zm9ybS10b29scy0wLjEuNVxcb3V0XFxzcmNcXGluZGV4LmpzIl0sImVudiI6eyJPTkVDX0lQQ19IT1NUIjoiMTI3LjAuMC4xIiwiT05FQ19JUENfUE9SVCI6IjQwMjQxIiwiT05FQ19JUENfVE9LRU4iOiIifX0%3D) - подставит в `mcp.json` конфиг как в примере ниже (хост 127.0.0.1, порт 40241, токен пустой).
- **Вручную:** см. конфиг ниже.

### Конфиг для Cursor (ручная настройка)

Конфиг можно положить **в проект** (только для этого проекта) или **глобально** (для всех проектов).

**В проекте (рекомендуется):**

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
      "args": ["${env:USERPROFILE}\\.cursor\\extensions\\yellow-hammer.mcp-1c-platform-tools-0.1.5\\out\\src\\index.js"],
      "env": {
        "ONEC_IPC_HOST": "127.0.0.1",
        "ONEC_IPC_PORT": "40241",
        "ONEC_IPC_TOKEN": ""
      }
    }
  }
}
```

**macOS/Linux:** в `args` — `"${env:HOME}/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.5/out/src/index.js"` (подставьте версию).

### Глобальный файл

Вместо файла в проекте можно использовать один конфиг для всех проектов:

- **Windows:** `%USERPROFILE%\.cursor\mcp.json`
- **macOS/Linux:** `~/.cursor/mcp.json`

Структура `mcpServers` та же. После изменений перезагрузите окно Cursor.

---

Убедитесь, что расширение **1c-platform-tools** установлено, IPC включён (`1c-platform-tools.ipc.enabled` = true) и в настройках указаны те же порт и токен, что в `env` конфига MCP.
