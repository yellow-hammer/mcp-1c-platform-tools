/**
 * Точка входа расширения VS Code: регистрирует MCP-сервер 1C Platform Tools (stdio).
 * Настройки IPC (порт, токен) передаются в процесс MCP через переменные окружения.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "./logger.js";

const MCP_PROVIDER_ID = "mcp-1c-platform-tools";

/**
 * Активирует расширение: регистрирует провайдер определений MCP-сервера и подписывается на очистку логгера.
 *
 * @param context — контекст расширения VS Code
 */
export function activate(context: vscode.ExtensionContext): void {
	const pkg = JSON.parse(fs.readFileSync(path.join(context.extensionPath, "package.json"), "utf8"));
	const version = pkg.version;

	const serverPath = path.join(context.extensionPath, "out", "src", "index.js");
	const server = new vscode.McpStdioServerDefinition(
		"mcp-1c-platform-tools",
		"node",
		[serverPath],
		{ MCP_1C_SERVER_VERSION: version },
		version
	);
	(server as { cwd?: vscode.Uri }).cwd = vscode.Uri.file(context.extensionPath);

	context.subscriptions.push(
		vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, {
			provideMcpServerDefinitions: async () => [server],
		}),
		{ dispose: () => logger.dispose() }
	);
	logger.info("MCP 1C Platform Tools: провайдер зарегистрирован");
}

/**
 * Деактивация расширения: освобождение ресурсов логгера.
 */
export function deactivate(): void {
	logger.dispose();
}
