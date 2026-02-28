# MCP-сервер для 1C Platform tools

MCP-сервер предоставляет инструменты Model Context Protocol для запуска команд расширения [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) через агентов Cursor/VS Code.

## Быстрый старт

1. Установите расширение [1c-platform-tools](https://marketplace.visualstudio.com/items?itemName=yellow-hammer.1c-platform-tools) и **MCP 1C Platform Tools** (из VS Code Marketplace или Open VSX).
2. Включите IPC: настройка `1c-platform-tools.ipc.enabled` = `true`.
3. Откройте проект 1С (папка с `packagedef`).

MCP регистрируется расширением: после установки и включения IPC ничего настраивать не нужно. В Cursor, если сервер не появился в списке MCP, откройте настройки Cursor → MCP и включите сервер **mcp-1c-platform-tools** (путь и параметры задаёт расширение).

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
