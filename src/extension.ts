/**
 * Точка входа расширения VS Code: регистрирует MCP-сервер 1C Platform Tools (stdio).
 * Настройки IPC (порт, токен) передаются в процесс MCP через переменные окружения.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "./logger.js";
import { writeCursorConfig, CursorServerConfig } from "./cursorConfig.js";

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
		vscode.commands.registerCommand("mcp-1c-platform-tools.configureCursor", () =>
			configureCursor(serverPath, false)
		),
		{ dispose: () => logger.dispose() }
	);
	logger.info("1C: Platform Tools MCP: провайдер зарегистрирован");

	// Путь к серверу содержит версию расширения: после обновления запись в
	// .cursor/mcp.json указывает на несуществующий каталог — чиним молча
	void configureCursor(serverPath, true);
	void offerIpc();
}

/**
 * Предлагает включить IPC, без которого сервер не видит расширение 1c-platform-tools.
 *
 * Настройка чужая, поэтому при обычном запуске её не меняем молча: показываем
 * предложение с кнопкой.
 */
async function offerIpc(): Promise<void> {
	if (isIpcEnabled()) {
		return;
	}
	const enable = "Включить";
	const answer = await vscode.window.showInformationMessage(
		"MCP-серверу нужен IPC расширения 1c-platform-tools: без него инструменты недоступны.",
		enable
	);
	if (answer === enable) {
		await enableIpc();
	}
}

/**
 * Проверяет, включён ли IPC расширения 1c-platform-tools.
 *
 * @returns true, если настройка включена
 */
function isIpcEnabled(): boolean {
	return vscode.workspace.getConfiguration("1c-platform-tools").get<boolean>("ipc.enabled") === true;
}

/**
 * Включает IPC расширения 1c-platform-tools.
 *
 * @returns true, если настройка включена или уже была включена
 */
async function enableIpc(): Promise<boolean> {
	try {
		await vscode.workspace
			.getConfiguration("1c-platform-tools")
			.update("ipc.enabled", true, vscode.ConfigurationTarget.Global);
		logger.info("Включена настройка 1c-platform-tools.ipc.enabled");
		return true;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`Не удалось включить 1c-platform-tools.ipc.enabled: ${message}`);
		void vscode.window.showWarningMessage(
			"Не удалось включить 1c-platform-tools.ipc.enabled. Проверьте, что расширение 1c-platform-tools установлено."
		);
		return false;
	}
}

/**
 * Параметры IPC из настроек расширения 1c-platform-tools.
 *
 * @returns Порт и токен для передачи серверу
 */
function readIpcSettings(): { port: number; token: string } {
	const config = vscode.workspace.getConfiguration("1c-platform-tools");
	return {
		port: config.get<number>("ipc.port", 40241),
		token: config.get<string>("ipc.token") ?? "",
	};
}

/**
 * Записывает конфиг MCP для Cursor в открытые проекты.
 *
 * @param serverPath — путь к запускаемому файлу сервера
 * @param onlyIfStale — только починка устаревшего пути, без создания файла
 */
async function configureCursor(serverPath: string, onlyIfStale: boolean): Promise<void> {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		if (!onlyIfStale) {
			void vscode.window.showWarningMessage(
				"Откройте проект 1С: конфиг записывается в .cursor/mcp.json проекта."
			);
		}
		return;
	}

	// Настройку MCP запросил сам пользователь: IPC входит в неё, отдельного
	// вопроса не задаём
	if (!onlyIfStale && !isIpcEnabled()) {
		await enableIpc();
	}

	const { port, token } = readIpcSettings();
	const config: CursorServerConfig = { serverPath, port, token };

	for (const folder of folders) {
		try {
			const outcome = await writeCursorConfig(folder.uri.fsPath, config, onlyIfStale);
			if (outcome === "unchanged") {
				continue;
			}
			logger.info(`Конфиг Cursor ${outcome === "created" ? "создан" : "обновлён"}: ${folder.name}`);
			if (!onlyIfStale) {
				void vscode.window.showInformationMessage(
					`Конфиг MCP для Cursor записан в ${folder.name}/.cursor/mcp.json. ` +
					"Перезагрузите окно, а затем включите сервер mcp-1c-platform-tools в настройках MCP: новый сервер Cursor добавляет выключенным."
				);
			} else {
				void vscode.window.showInformationMessage(
					`Путь к MCP-серверу в ${folder.name}/.cursor/mcp.json обновлён после обновления расширения. Перезагрузите окно.`
				);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`Не удалось записать конфиг Cursor (${folder.name}): ${message}`);
			if (!onlyIfStale) {
				void vscode.window.showErrorMessage(`Не удалось записать .cursor/mcp.json: ${message}`);
			}
		}
	}
}

/**
 * Деактивация расширения: освобождение ресурсов логгера.
 */
export function deactivate(): void {
	logger.dispose();
}
