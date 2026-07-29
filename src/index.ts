/**
 * Standalone MCP-сервер (stdio): получает список команд расширения по IPC,
 * регистрирует по одному инструменту на команду и обслуживает вызовы через stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IpcClient, CommandDescriptor } from "./ipcClient.js";
import { formatCommandResult, isFailedResult } from "./formatCommandResult.js";
import { logger } from "./loggerServer.js";
import { describeCommand, uniqueToolName } from "./toolName.js";
import { paramsForCommand } from "./toolParams.js";

/**
 * Таймаут IPC для команд без ожидания (мс).
 * Команды запускаются в UI-терминале и возвращают управление сразу.
 */
const TIMEOUT_DEFAULT_MS = 60_000;

/**
 * Таймаут IPC для команд с wait: true (мс).
 *
 * Команды выполняются синхронно; полный прогон тестов или сборка большой
 * конфигурации идут дольше нескольких минут, поэтому предел поднимается
 * переменной окружения MCP_1C_WAIT_TIMEOUT_MS.
 */
const TIMEOUT_WAIT_MS = readWaitTimeout();

/**
 * Читает таймаут синхронных команд из MCP_1C_WAIT_TIMEOUT_MS.
 *
 * @returns таймаут в миллисекундах (по умолчанию 30 минут)
 */
function readWaitTimeout(): number {
	const raw = Number.parseInt(process.env.MCP_1C_WAIT_TIMEOUT_MS ?? "", 10);
	return Number.isFinite(raw) && raw > 0 ? raw : 1_800_000;
}

/** Параметры вызова инструмента: набор полей зависит от команды. */
interface ToolParams {
	projectPath: string;
	wait?: boolean;
	settingsFile?: string;
	ibConnection?: string;
	pathsOverride?: Record<string, string | undefined>;
	sha?: string;
	extensions?: string[];
	profile?: string;
	frameworks?: string[];
	execute?: string;
	command?: string;
}

/**
 * Выполняет команду расширения по IPC и возвращает контент для MCP-инструмента.
 *
 * При wait: true использует увеличенный таймаут и передаёт флаг в расширение,
 * которое запускает команду синхронно и возвращает структурированный результат.
 *
 * @param ipcClient — клиент IPC
 * @param commandId — идентификатор команды расширения
 * @param params — параметры инструмента
 * @returns контент с типом "text" (успех или сообщение об ошибке)
 */
async function runTool(
	ipcClient: IpcClient,
	commandId: string,
	params: ToolParams
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
	const wait = params.wait ?? true;
	const timeoutMs = wait ? TIMEOUT_WAIT_MS : TIMEOUT_DEFAULT_MS;

	try {
		const result = await ipcClient.executeCommand(
			commandId,
			[{
				wait,
				settingsFile: params.settingsFile,
				ibConnection: params.ibConnection,
				pathsOverride: params.pathsOverride,
				sha: params.sha,
				extensions: params.extensions,
				profile: params.profile,
				frameworks: params.frameworks,
				execute: params.execute,
				command: params.command,
			}],
			params.projectPath,
			timeoutMs
		);
		const text = formatCommandResult(result);
		const failed = isFailedResult(result);
		return failed
			? { content: [{ type: "text", text }], isError: true }
			: { content: [{ type: "text", text }] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`runTool ${commandId}: ${message}`);
		return {
			content: [
				{
					type: "text",
					text: `Не удалось выполнить команду: ${message}`,
				},
			],
			isError: true,
		};
	}
}

/**
 * Возвращает версию MCP-сервера из переменной окружения или «0.0.0».
 *
 * @returns строка версии
 */
function getServerVersion(): string {
	return process.env.MCP_1C_SERVER_VERSION ?? "0.0.0";
}

/**
 * Инициализация MCP-сервера: получение списка команд по IPC,
 * регистрация инструментов, подключение stdio-транспорта.
 */
async function main(): Promise<void> {
	const version = getServerVersion();
	const server = new McpServer(
		{
			name: "mcp-1c-platform-tools",
			version,
		},
		{
			capabilities: {
				tools: { listChanged: true },
			},
		}
	);

	const ipcClient = new IpcClient();
	const registered = new Set<string>();
	const usedNames = new Set<string>();

	/**
	 * Регистрирует инструменты для команд, которых ещё нет.
	 *
	 * @param descriptors — команды расширения с заголовками
	 * @returns количество добавленных инструментов
	 */
	const registerTools = (descriptors: CommandDescriptor[]): number => {
		let added = 0;
		for (const descriptor of descriptors) {
			if (registered.has(descriptor.id)) {
				continue;
			}
			registered.add(descriptor.id);
			try {
				server.registerTool(
					uniqueToolName(descriptor.id, usedNames),
					{
						description: describeCommand(descriptor),
						inputSchema: paramsForCommand(descriptor.id),
					},
					async (input) => runTool(ipcClient, descriptor.id, input as unknown as ToolParams)
				);
				added += 1;
			} catch (err) {
				// Одна проблемная команда не должна оставлять агента совсем без
				// инструментов: пропускаем её и регистрируем остальные
				const message = err instanceof Error ? err.message : String(err);
				logger.error(`Инструмент для команды ${descriptor.id} не зарегистрирован: ${message}`);
			}
		}
		return added;
	};

	let descriptors: CommandDescriptor[] = [];
	try {
		descriptors = await ipcClient.listCommandDescriptors();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(
			`Не удалось получить список команд по IPC: ${message}. ` +
			"Включите расширение 1c-platform-tools и настройку 1c-platform-tools.ipc.enabled."
		);

		// Список команд запрашивается один раз при запуске: если VS Code ещё не
		// открыт, инструментов не будет до перезапуска сервера. Заглушка
		// повторяет попытку и регистрирует инструменты, когда расширение
		// отозвалось; клиент узнаёт о них по notifications/tools/list_changed
		usedNames.add("onec_platform_tools_status");
		const placeholder = server.registerTool(
			"onec_platform_tools_status",
			{
				description:
					"Состояние подключения к расширению 1C: Platform Tools. " +
					"Вызовите, если инструментов 1С не видно: сервер повторит подключение.",
			},
			async () => {
				try {
					const late = await ipcClient.listCommandDescriptors();
					const added = registerTools(late);
					if (added > 0) {
						placeholder.remove();
						logger.info(`MCP-сервер: зарегистрировано ${added} инструментов после повторного подключения`);
						return {
							content: [
								{
									type: "text" as const,
									text: `Расширение отозвалось, доступно инструментов: ${added}. Повторите вызов нужного инструмента.`,
								},
							],
						};
					}
				} catch (retryError) {
					const retryMessage =
						retryError instanceof Error ? retryError.message : String(retryError);
					logger.warn(`Повторное подключение по IPC не удалось: ${retryMessage}`);
				}
				return {
					content: [
						{
							type: "text" as const,
							text: "Расширение 1c-platform-tools недоступно по IPC. Откройте VS Code с проектом 1С и включите настройку 1c-platform-tools.ipc.enabled.",
						},
					],
					isError: true,
				};
			}
		);
	}

	const count = registerTools(descriptors);
	if (count > 0) {
		logger.info(`MCP-сервер: зарегистрировано ${count} инструментов`);
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);
	logger.info("MCP-сервер 1C Platform Tools запущен (stdio)");
}

try {
	await main();
} catch (err) {
	logger.error(`MCP main: ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
}
