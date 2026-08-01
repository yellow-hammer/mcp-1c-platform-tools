# Журнал изменений

Все заметные изменения в этом проекте будут задокументированы в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
и этот проект придерживается [Semantic Versioning](https://semver.org/lang/ru/).

## [0.1.12] - 2026-08-01


### Новые возможности

- **tools:** Отбор расширений для команд тестовых расширений


### Обслуживание

- **tools:** Убрали pathsOverride, который ничего не делал


## [0.1.11] - 2026-07-30


### Новые возможности

- **session:** Параметры сеансов под vanessa-runner 3


### Исправления

- **tools:** Убрали команду, которой в расширении нет


## [0.1.10] - 2026-07-30


### Новые возможности

- **format:** Фактический результат тестов в ответе инструмента

- **tools:** Параметры операций и синхронный режим по умолчанию

- **cursor:** Конфиг MCP пишется и чинится расширением

- **tools:** Описания инструментов, признак ошибки и обрезка вывода

- **tools:** Параметры инструмента по команде, а не общим списком

- **tools:** Инструкция серверу, путь проекта и проверка сборки списка


### Исправления

- **tools:** Сбой одной команды не оставляет агента без инструментов

- **cursor:** Подсказываем включить сервер после настройки

- **tools:** Параметры сеансов и цепочек в схемах инструментов


### Прочее

- **deps:** Bump the npm_and_yarn group across 1 directory with 2 updates

- **deps:** Bump the npm_and_yarn group across 1 directory with 3 updates

- **deps:** Обновили зависимости и устранили уязвимости

- Локальные настройки Claude Code не попадают в пакет


### Рефакторинг

- **tools:** Имена команд под новую схему расширения


### Документация

- README и примеры вызовов для агента


### Обслуживание

- **debug:** Отладка MCP-сервера агента вместо отдельного запуска

- **release:** Описание релиза берётся из секции версии


## [0.1.9] - 2026-07-15


### Прочее

- **deps-dev:** Bump esbuild

- **deps-dev:** Bump tmp in the npm_and_yarn group across 1 directory

- **deps-dev:** Bump the npm_and_yarn group across 1 directory with 3 updates

- **deps:** Bump hono in the npm_and_yarn group across 1 directory

- **deps-dev:** Bump undici


### Рефакторинг

- **logger:** Перешли на LogOutputChannel со своим каналом

- **logger:** Переименовали канал в «1C: Platform Tools MCP»


### Документация

- Описали общие параметры инструментов и каталоги проекта

- Перенесли параметры в docs и удалили шпаргалку по npm


### Обслуживание

- Единый релизный workflow и changelog без иконок

- Задачи VS Code в едином стиле


## [0.1.8] - 2026-06-06


### Новые возможности

- Добавлены скрипты для генерации и обновления ссылки на установку MCP в файле README


### Прочее

- **deps:** Bump uuid in the npm_and_yarn group across 1 directory

- **deps:** Bump qs in the npm_and_yarn group across 1 directory

- **deps-dev:** Bump tmp in the npm_and_yarn group across 1 directory

- **deps:** Bump hono in the npm_and_yarn group across 1 directory


## [0.1.7] - 2026-05-20


### Новые возможности

- **mcp:** Параметр wait и структурированный вывод для агентов (#15)


### Исправления

- Исправлено название проекта на "1C: Platform Tools MCP" во всех файлах


### Прочее

- **deps:** Bump the npm_and_yarn group across 1 directory with 2 updates

- **deps:** Bump express-rate-limit

- **deps:** Bump hono in the npm_and_yarn group across 1 directory

- **deps-dev:** Bump undici

- **deps:** Bump path-to-regexp

- **deps:** Bump the npm_and_yarn group across 1 directory with 4 updates

- **deps:** Bump ip-address

- **deps:** Bump the npm_and_yarn group across 1 directory with 2 updates


### Документация

- Обновили README, добавив новые значки для чата Telegram и Devin AI.

- Обновление README.md с заменой значков на новые изображения для Telegram и DeepWiki

- Добавлены новые правила по эволюции контракта и совместимости в файлы стиля кода


## [0.1.6] - 2026-03-01


### Документация

- Обновлены инструкции по настройке MCP в README и CONTRIBUTING, удалены устаревшие файлы конфигурации, добавлен скрипт для генерации ссылки установки MCP для Cursor


## [0.1.5] - 2026-02-28


### Новые возможности

- Добавлены файлы конфигурации для MCP Registry, обновлены зависимости и документация


### Исправления

- Обновлено название в package.json и README.md для соответствия формату


### Рефакторинг

- Удален устаревший файл MCP_REGISTRY_PUBLISH.md, добавлена новая документация по публикации MCP 1C Platform Tools в npm и MCP Registry


## [0.1.0] - 2026-02-28


### Новые возможности

- MCP-сервер, IPC-клиент и расширение VS Code

- Ресурсы расширения (иконка)


### Прочее

- Конфигурация сборки и релизов


### Документация

- Добавлен README.md для mcp сервера

- Лицензия и документация для участников


### Тестирование

- Юнит-тесты для ipcClient, toolName и formatCommandResult


### Обслуживание

- Инициализация проекта (package.json, tsconfig, gitignore)

- GitHub Actions, шаблоны issue/PR и FUNDING

- Конфигурация VS Code и правила Cursor

