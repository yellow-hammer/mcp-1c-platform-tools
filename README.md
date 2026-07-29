# 1C: Platform Tools MCP

[![OpenYellow](https://openyellow.openintegrations.dev/data/badges/1160221881.png)](https://openyellow.org/grid?filter=top&repo=1160221881)
[![telegram chat](resources/badges/telegram-chat.png)](https://t.me/wonder_yellow)
[![Ask Devin](resources/badges/deepwiki-badge.png)](https://deepwiki.com/yellow-hammer/mcp-1c-platform-tools)

MCP-сервер даёт агенту Cursor или VS Code доступ к командам расширения [1C: Platform Tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools): тесты, профили запуска, сборка конфигурации, работа с базой.

## Установка

1. Установите **1C: Platform Tools**: [Marketplace](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools), [Open VSX](https://open-vsx.org/extension/yellow-hammer/1c-platform-tools)
2. Установите **1C: Platform Tools MCP**: [Marketplace](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.mcp-1c-platform-tools), [Open VSX](https://open-vsx.org/extension/yellow-hammer/mcp-1c-platform-tools)
3. Откройте проект 1С (папка с `packagedef`).

## Подключение

**VS Code** больше ничего не требует: расширение регистрирует MCP-сервер само.

**Cursor** не поддерживает провайдер MCP-серверов VS Code, поэтому сервер подключается через `.cursor/mcp.json` проекта. Файл создаёт и обновляет расширение:

1. Палитра команд (F1) → `1C: Platform Tools MCP: Настроить MCP для Cursor`, либо в дереве **Инструменты 1С** → **Навыки для AI** → **Настроить MCP для Cursor**.
2. Перезагрузите окно.

Команда пишет путь к серверу и параметры IPC; другие серверы в файле сохраняются. Путь содержит версию расширения, поэтому после обновления запись устаревает и сервер падает с `MODULE_NOT_FOUND`. Расширение чинит это при запуске: обновляет путь, если он ведёт на другую установку этого же расширения. Путь, прописанный вручную (например, на сборку из исходников), остаётся как есть.

## Проверка

Напишите агенту «покажи состояние окружения 1С». В ответе будут активный профиль запуска, версия платформы и путь к базе. Дальше можно просить прогон тестов, переключение профиля, сборку конфигурации.

## Документация

- [Что писать агенту](docs/examples.md)
- [Параметры инструментов](docs/tool-parameters.md)

## Настройка вручную

Нужна, только если конфиг заводится без расширения. Настройка `1c-platform-tools.ipc.enabled` должна быть включена, значения `ONEC_IPC_*` берутся из `1c-platform-tools.ipc.*`:

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

Каталог расширения: `%USERPROFILE%\.cursor\extensions\yellow-hammer.mcp-1c-platform-tools-<версия>-universal` (Windows) или `~/.cursor/extensions/...` (macOS, Linux). После каждого обновления расширения такой путь придётся править руками.

Глобальный конфиг (`%USERPROFILE%\.cursor\mcp.json`) работает так же, но его расширение не обновляет: для нескольких проектов надёжнее проектный файл.
