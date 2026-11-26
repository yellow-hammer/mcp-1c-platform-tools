/**
 * Точка входа расширения VS Code: регистрирует MCP-сервер 1C Platform Tools (stdio)
 * и передаёт ему окно, из которого он запущен.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "./logger.js";
import { notifyQuiet } from "./notify.js";
import { CLAUDE_CODE, CURSOR, writeAgentConfig, type AgentConfigTarget } from "./agentConfig.js";
import { hasMcpWindow, type PlatformToolsApi } from "./platformToolsApi.js";

const MCP_PROVIDER_ID = "mcp-1c-platform-tools";
const MCP_WINDOW_RETRY_MS = 5_000;

/** Расширение, к командам которого сервер даёт доступ. */
const PLATFORM_TOOLS_ID = "yellow-hammer.1c-platform-tools";

/** Отказ, когда 1C: Platform Tools не даёт окно MCP-серверу. */
const PLATFORM_TOOLS_OUTDATED =
	"Обновите 1C: Platform Tools до последней версии: с этой версией MCP-сервер не подключится к окну.";

/**
 * Активирует расширение: регистрирует провайдер определений MCP-сервера и подписывается на очистку логгера.
 *
 * @param context — контекст расширения VS Code
 */
export function activate(context: vscode.ExtensionContext): void {
	const pkg = JSON.parse(fs.readFileSync(path.join(context.extensionPath, "package.json"), "utf8"));
	const version = pkg.version;

	const serverPath = path.join(context.extensionPath, "out", "src", "index.js");
	context.subscriptions.push(
		registerMcpProvider(serverPath, vscode.Uri.file(context.extensionPath), version),
		vscode.commands.registerCommand("mcp-1c-platform-tools.configureCursor", () =>
			configureAgent(CURSOR, serverPath, false)
		),
		{ dispose: () => logger.dispose() }
	);
	logger.info("1C: Platform Tools MCP: провайдер зарегистрирован");

	// Путь к серверу содержит версию расширения: после обновления запись в
	// конфиге клиента указывает на несуществующий каталог — чиним молча
	void configureAgent(CURSOR, serverPath, true);
	void configureAgent(CLAUDE_CODE, serverPath, true);
	void checkPlatformTools();
}

/**
 * API 1C: Platform Tools с окном для MCP-сервера.
 *
 * @returns API либо undefined, если у расширения такого API нет
 */
async function platformToolsApi(): Promise<PlatformToolsApi | undefined> {
	const extension = vscode.extensions.getExtension(PLATFORM_TOOLS_ID);
	if (!extension) {
		return undefined;
	}
	try {
		const api: unknown = await extension.activate();
		return hasMcpWindow(api) ? api : undefined;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`1C: Platform Tools не активировалось: ${message}`);
		return undefined;
	}
}

/**
 * Сообщает, если 1C: Platform Tools не даёт окно MCP-серверу.
 */
async function checkPlatformTools(): Promise<void> {
	if (await platformToolsApi()) {
		return;
	}
	logger.warn(PLATFORM_TOOLS_OUTDATED);
	const open = "Открыть расширение";
	if ((await vscode.window.showWarningMessage(PLATFORM_TOOLS_OUTDATED, open)) === open) {
		await vscode.commands.executeCommand("workbench.extensions.search", PLATFORM_TOOLS_ID);
	}
}

/**
 * Публикует определение с окном для VS Code и Copilot Agent Host.
 *
 * @param serverPath — путь к запускаемому файлу сервера
 * @param cwd — рабочий каталог процесса сервера
 * @param version — версия расширения
 * @returns регистрация провайдера и подписки для её обновления
 */
function registerMcpProvider(serverPath: string, cwd: vscode.Uri, version: string): vscode.Disposable {
	const definitionsChanged = new vscode.EventEmitter<void>();
	let retry: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	const provider: vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition> = {
		onDidChangeMcpServerDefinitions: definitionsChanged.event,
		// Agent Host берёт это определение без вызова resolveMcpServerDefinition.
		async provideMcpServerDefinitions() {
			if (!vscode.workspace.isTrusted) {
				return [];
			}
			const api = await platformToolsApi();
			if (!api || disposed) {
				return [];
			}

			let windowId: string | undefined;
			let problem = "Окно не подключено к MCP-серверу. Причина в журнале 1C: Platform Tools.";
			try {
				windowId = await api.getMcpWindow();
			} catch (err) {
				problem = `Не удалось получить окно для MCP-сервера: ${err instanceof Error ? err.message : String(err)}`;
			}
			if (disposed) {
				return [];
			}

			clearTimeout(retry);
			if (!windowId) {
				if (!retry) {
					logger.warn(`${problem} Повторим подключение автоматически.`);
				}
				retry = setTimeout(() => definitionsChanged.fire(), MCP_WINDOW_RETRY_MS);
				retry.unref();
				return [];
			}
			retry = undefined;

			const server = new vscode.McpStdioServerDefinition(
				MCP_PROVIDER_ID,
				"node",
				[serverPath],
				{ MCP_1C_SERVER_VERSION: version, MCP_1C_WINDOW: windowId },
				version
			);
			server.cwd = cwd;
			return [server];
		},
	};

	return vscode.Disposable.from(
		new vscode.Disposable(() => {
			disposed = true;
			clearTimeout(retry);
		}),
		vscode.lm.registerMcpServerDefinitionProvider(MCP_PROVIDER_ID, provider),
		vscode.workspace.onDidGrantWorkspaceTrust(() => definitionsChanged.fire()),
		definitionsChanged
	);
}

/**
 * Записывает конфиг MCP клиента в открытые папки.
 *
 * @param target — клиент MCP
 * @param serverPath — путь к запускаемому файлу сервера
 * @param onlyIfStale — только починка устаревшей записи, без создания файла
 */
async function configureAgent(target: AgentConfigTarget, serverPath: string, onlyIfStale: boolean): Promise<void> {
	const folders = (vscode.workspace.workspaceFolders ?? []).filter((folder) => folder.uri.scheme === "file");
	if (folders.length === 0) {
		if (!onlyIfStale) {
			void vscode.window.showWarningMessage(
				`Откройте проект 1С: конфиг записывается в ${target.file} проекта.`
			);
		}
		return;
	}

	for (const folder of folders) {
		const file = `${folder.name}/${target.file.replaceAll("\\", "/")}`;
		try {
			const outcome = await writeAgentConfig(target, { serverPath, workspace: folder.uri.fsPath }, onlyIfStale);
			if (outcome === "unchanged") {
				continue;
			}
			const done = onlyIfStale
				? `Обновлена запись MCP-сервера в ${file}`
				: `Конфиг MCP для ${target.label} записан в ${file}`;
			notifyQuiet(done);
			logger.info(onlyIfStale ? target.afterUpdate : target.afterCreate);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error(`Не удалось записать конфиг ${target.label} (${file}): ${message}`);
			if (!onlyIfStale) {
				void vscode.window.showErrorMessage(`Не удалось записать ${target.file}: ${message}`);
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
