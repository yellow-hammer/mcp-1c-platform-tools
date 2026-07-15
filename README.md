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

В **Cursor** расширение не может прописать MCP в настройки, поэтому конфиг нужно добавить вручную. Варианты:

- **Кнопка:** [![Add 1C: Platform Tools MCP to Cursor](resources/mcp-install-dark.png)](https://cursor.com/en/install-mcp?name=mcp-1c-platform-tools&config=eyJjb21tYW5kIjoibm9kZSIsImFyZ3MiOlsiJHtlbnY6VVNFUlBST0ZJTEV9XFwuY3Vyc29yXFxleHRlbnNpb25zXFx5ZWxsb3ctaGFtbWVyLm1jcC0xYy1wbGF0Zm9ybS10b29scy0wLjEuOC11bml2ZXJzYWxcXG91dFxcc3JjXFxpbmRleC5qcyJdLCJlbnYiOnsiT05FQ19JUENfSE9TVCI6IjEyNy4wLjAuMSIsIk9ORUNfSVBDX1BPUlQiOiI0MDI0MSIsIk9ORUNfSVBDX1RPS0VOIjoiIn19) - подставит в `mcp.json` конфиг как в примере ниже (хост 127.0.0.1, порт 40241, токен пустой).
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
      "args": ["${env:USERPROFILE}\\.cursor\\extensions\\yellow-hammer.mcp-1c-platform-tools-0.1.8-universal\\out\\src\\index.js"],
      "env": {
        "ONEC_IPC_HOST": "127.0.0.1",
        "ONEC_IPC_PORT": "40241",
        "ONEC_IPC_TOKEN": ""
      }
    }
  }
}
```

**macOS/Linux:** в `args` — `"${env:HOME}/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.8-universal/out/src/index.js"` (подставьте фактическое имя папки из `~/.cursor/extensions/`).

### Глобальный файл

Вместо файла в проекте можно использовать один конфиг для всех проектов:

- **Windows:** `%USERPROFILE%\.cursor\mcp.json`
- **macOS/Linux:** `~/.cursor/mcp.json`

Структура `mcpServers` та же. После изменений перезагрузите окно Cursor.

## Общие параметры инструментов

Эти параметры принимает каждый инструмент сервера.

| Параметр | Назначение |
|---|---|
| `projectPath` | Обязательный. Абсолютный путь к корню проекта 1С (папка с `packagedef`/`env.json`) |
| `settingsFile` | Файл настроек vanessa-runner относительно `projectPath`. По умолчанию активный профиль проекта (`env.json`) |
| `ibConnection` | Явная строка подключения к ИБ. Без неё берётся значение из файла настроек, иначе `/F./build/ib` |
| `pathsOverride` | Переопределение стандартных каталогов проекта (см. ниже) |
| `wait` | Ждать завершения и вернуть `{ success, exitCode, stdout, stderr, artifact, durationMs }`. По умолчанию `false`: команда уходит в терминал, управление возвращается сразу |

### Профили запуска и settingsFile

`settingsFile` перекрывает активный профиль для конкретного вызова. Так выбирается нужный набор сценариев, не переключая профиль в статус-баре:

```jsonc
// прогон init-сценариев вместо основного набора
{ "projectPath": "C:/work/erp", "settingsFile": "tools/vrunner.init.json" }
```

### Каталоги проекта и pathsOverride

Инструменты работают по конвенции каталогов расширения. Если исходники лежат в другом месте, каталог указывается через `pathsOverride`, иначе они не попадут в сборку.

| Ключ | Каталог по умолчанию | Содержимое |
|---|---|---|
| `cf` | `src/cf` | Исходники конфигурации |
| `cfe` | `src/cfe` | Исходники расширений |
| `epf` | `src/epf` | Исходники внешних обработок |
| `erf` | `src/erf` | Исходники внешних отчётов |
| `out` | `build/out` | Результаты сборки; собранные `.epf` попадают в `build/out/epf` |

Пути указываются относительно `projectPath`:

```jsonc
// обработки лежат в tools/epf, а не в src/epf
{ "projectPath": "C:/work/erp", "pathsOverride": { "epf": "tools/epf" } }
```

---

Убедитесь, что расширение **1c-platform-tools** установлено, IPC включён (`1c-platform-tools.ipc.enabled` = true) и в настройках указаны те же порт и токен, что в `env` конфига MCP.
