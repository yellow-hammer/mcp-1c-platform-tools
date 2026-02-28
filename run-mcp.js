#!/usr/bin/env node
/**
 * Точка входа для npx / npm bin. Запускает MCP-сервер из out/src/index.js.
 * Корневой файл без слэшей в пути — иначе npm при публикации удаляет bin.
 */
import "./out/src/index.js";
