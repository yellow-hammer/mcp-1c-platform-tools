# 1C: Platform Tools MCP

[![OpenYellow](https://openyellow.openintegrations.dev/data/badges/1160221881.png)](https://openyellow.org/grid?filter=top&repo=1160221881)
[![telegram chat](resources/badges/telegram-chat.png)](https://t.me/wonder_yellow)
[![Ask Devin](resources/badges/deepwiki-badge.png)](https://deepwiki.com/yellow-hammer/mcp-1c-platform-tools)

MCP-сервер предоставляет инструменты Model Context Protocol для запуска команд расширения [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) через агентов Cursor/VS Code.

## Быстрый старт

1. Установите расширение [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) и расширение **1C: Platform Tools MCP**.
2. Включите IPC: настройка `1c-platform-tools.ipc.enabled` = `true`.
3. Откройте проект 1С (папка с `packagedef`).

В **VS Code** дополнительная настройка не нужна: расширение само регистрирует MCP. Достаточно установить оба расширения и включить IPC.

В **Cursor** провайдер MCP-серверов VS Code не поддерживается, поэтому сервер подключается через файл `.cursor/mcp.json` проекта. Расширение умеет создавать и обновлять его само:

1. Установите расширение: [![Установить в Cursor](resources/mcp-install-dark.png)](https://open-vsx.org/extension/yellow-hammer/mcp-1c-platform-tools)
2. Откройте проект 1С.
3. Палитра команд (F1) → **1C: Platform Tools MCP: Настроить MCP для Cursor**, либо в дереве **Инструменты 1С** → **Навыки для AI** → **Настроить MCP для Cursor**.
4. Перезагрузите окно.

Команда пишет в `.cursor/mcp.json` актуальный путь к серверу и параметры IPC из настроек `1c-platform-tools.ipc.*`; другие серверы в файле сохраняются.

Путь к серверу содержит версию расширения, поэтому после его обновления запись устаревает и сервер падает с `MODULE_NOT_FOUND`. Расширение чинит это само: при запуске обновляет путь, если он указывает на другую установку этого же расширения. Путь, прописанный вручную (например, на сборку из исходников), не трогается.

### Ручная настройка

Если конфиг нужно завести без расширения, структура такая:

```json
{
  "mcpServers": {
    "mcp-1c-platform-tools": {
      "command": "node",
      "args": ["<путь к каталогу расширения>/out/src/index.js"],
      "env": {
        "ONEC_IPC_HOST": "127.0.0.1",
        "ONEC_IPC_PORT": "40241",
        "ONEC_IPC_TOKEN": ""
      }
    }
  }
}
```

Каталог расширения: `%USERPROFILE%\.cursor\extensions\yellow-hammer.mcp-1c-platform-tools-<версия>-universal` (Windows) или `~/.cursor/extensions/...` (macOS/Linux). Такой путь придётся обновлять после каждого обновления расширения — команда выше делает это автоматически.

Глобальный конфиг (`%USERPROFILE%\.cursor\mcp.json`) работает так же, но его расширение не обновляет: для нескольких проектов надёжнее проектный файл.

## Документация

- [Общие параметры инструментов](docs/tool-parameters.md)
- [Что писать агенту](docs/examples.md) — фразы для чата и что произойдёт: тесты, профили запуска, конфигурация, база.

---

Убедитесь, что расширение **1c-platform-tools** установлено, IPC включён (`1c-platform-tools.ipc.enabled` = true) и в настройках указаны те же порт и токен, что в `env` конфига MCP.
