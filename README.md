# 1C: Platform Tools MCP

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/yellow-hammer.mcp-1c-platform-tools?label=VS%20Marketplace&logo=visualstudiocode&color=0098FF)](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.mcp-1c-platform-tools)
[![Open VSX](https://img.shields.io/open-vsx/v/yellow-hammer/mcp-1c-platform-tools?label=Open%20VSX&logo=eclipseide&color=C160EF)](https://open-vsx.org/extension/yellow-hammer/mcp-1c-platform-tools)
[![OpenYellow](https://openyellow.openintegrations.dev/data/badges/1160221881.png)](https://openyellow.org/grid?filter=top&repo=1160221881)
[![telegram chat](resources/badges/telegram-chat.png)](https://t.me/wonder_yellow)
[![Ask Devin](resources/badges/deepwiki-badge.png)](https://deepwiki.com/yellow-hammer/mcp-1c-platform-tools)

MCP-сервер даёт агенту VS Code или Cursor доступ к командам расширения [1C: Platform Tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) в проектах конфигуратора, 1С:EDT и OneScript: тесты, профили запуска, сборка конфигурации, работа с базой.

## Установка

1. Установите **1C: Platform Tools**: [Marketplace](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools), [Open VSX](https://open-vsx.org/extension/yellow-hammer/1c-platform-tools)
2. Установите **1C: Platform Tools MCP**: [Marketplace](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.mcp-1c-platform-tools), [Open VSX](https://open-vsx.org/extension/yellow-hammer/mcp-1c-platform-tools)
3. Откройте проект 1С (папка с `packagedef`).

## Подключение

**VS Code.** Ничего дополнительно не нужно.

**Cursor.** В палитре команд или в дереве **Инструменты 1С** → **Навыки для AI** выполните **Настроить MCP для Cursor**. Перезагрузите окно и включите сервер `mcp-1c-platform-tools` в настройках MCP: новый сервер Cursor добавляет выключенным.

После обновления расширения путь к серверу в этом файле обновляется сам. Путь, который вы прописали сами, не меняется.

## Проверка

Напишите агенту «покажи состояние окружения 1С». В ответе будут активный профиль запуска, версия платформы и путь к базе. Дальше можно просить прогон тестов, переключение профиля, сборку конфигурации.

## Документация

[Установка и подключение](docs/index.md), [параметры инструментов](docs/tool-parameters.md), [что писать агенту](docs/examples.md). На сайте: [MCP-сервер](https://yellow-hammer.github.io/vscode-1c-platform-tools/mcp/).

## Настройка вручную

Нужна, только если конфиг заводится без расширения. Сервер запускают из папки проекта.

```json
{
  "mcpServers": {
    "mcp-1c-platform-tools": {
      "command": "node",
      "args": ["<путь к каталогу расширения>/out/src/index.js"]
    }
  }
}
```

Каталог расширения: `%USERPROFILE%\.cursor\extensions\yellow-hammer.mcp-1c-platform-tools-<версия>-universal` (Windows) или `~/.cursor/extensions/...` (macOS, Linux).
