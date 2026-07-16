/**
 * Standalone MCP-сервер (stdio): получает список команд расширения по IPC,
 * регистрирует по одному инструменту на команду и обслуживает вызовы через stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IpcClient } from "./ipcClient.js";
import { formatCommandResult } from "./formatCommandResult.js";
import { logger } from "./loggerServer.js";
import { commandIdToToolName } from "./toolName.js";

/**
 * Таймаут IPC для команд без ожидания (мс).
 * Команды запускаются в UI-терминале и возвращают управление сразу.
 */
const TIMEOUT_DEFAULT_MS = 60_000;

/**
 * Таймаут IPC для команд с wait: true (мс).
 * Команды выполняются синхронно; сборка/проверка могут занимать несколько минут.
 */
const TIMEOUT_WAIT_MS = 300_000;

/**
 * Схема параметров инструментов.
 * projectPath обязателен; остальные поля опциональны.
 */
const baseParamsShape = {
	projectPath: z
		.string()
		.min(1, "projectPath не должен быть пустым")
		.describe("Абсолютный путь к корню проекта 1С (где лежит packagedef/env.json)"),
	settingsFile: z
		.string()
		.optional()
		.describe("Путь к env.json относительно projectPath. По умолчанию: env.json"),
	ibConnection: z
		.string()
		.optional()
		.describe("Явная строка подключения к ИБ. Если не задана, берётся из env.json или /F./build/ib"),
	pathsOverride: z
		.object({
			cf: z.string().optional(),
			out: z.string().optional(),
			cfe: z.string().optional(),
			epf: z.string().optional(),
			erf: z.string().optional(),
		})
		.optional()
		.describe("Переопределение стандартных путей src/cf, build/out, src/cfe, src/epf, src/erf относительно projectPath"),
	sha: z
		.string()
		.optional()
		.describe(
			"SHA коммита для инкрементальной загрузки конфигурации (cfg_loadIncFromSrc). " +
			"Пустая строка — полная загрузка. Без параметра команда запросит ввод в UI."
		),
	extensions: z
		.array(z.string())
		.optional()
		.describe(
			"Явный список имён расширений для команд extensions_*. " +
			"Без него используется сохранённый выбор проекта (или все расширения)."
		),
	frameworks: z
		.array(z.string())
		.optional()
		.describe(
			"Ключи включаемых тестовых фреймворков для testing_configure: " +
			"vanessa, xunit, yaxunit, onescript, onebdd. Остальные выключаются."
		),
	execute: z
		.string()
		.optional()
		.describe(
			"Путь к внешней обработке/отчёту (.epf/.erf) для enterprise_run (vrunner run --execute)."
		),
	command: z
		.string()
		.optional()
		.describe(
			"Строка параметров запуска /C для enterprise_run (vrunner run --command), " +
			"например 'Путь=./fixtures/Константы.xml;ЗавершитьРаботуСистемы'."
		),
	wait: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"Ждать завершения операции и вернуть структурированный результат " +
			"{ success, exitCode, stdout, stderr, artifact, durationMs }. " +
			"По умолчанию false — команда запускается в UI-терминале и возвращает управление немедленно. " +
			"Используйте wait: true для автономных агентных сценариев (проверка, сборка, фикс в цикле)."
		),
} as const;

/** Тип параметров инструмента, выводимый из baseParamsShape. */
type BaseParams = {
	[K in keyof typeof baseParamsShape]: z.infer<(typeof baseParamsShape)[K]>;
};

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
	params: BaseParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
	const wait = params.wait ?? false;
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
				frameworks: params.frameworks,
				execute: params.execute,
				command: params.command,
			}],
			params.projectPath,
			timeoutMs
		);
		const text = formatCommandResult(result);
		return { content: [{ type: "text", text }] };
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
				tools: {},
			},
		}
	);

	const ipcClient = new IpcClient();

	let commandIds: string[] = [];
	try {
		commandIds = await ipcClient.listCommands();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`Не удалось получить список команд по IPC: ${message}. Включите расширение 1c-platform-tools и настройку 1c-platform-tools.ipc.enabled.`);
		server.registerTool(
			"onec_platform_tools_status",
			{ inputSchema: { message: z.string().optional().describe("Не используется") } },
			async () => ({
				content: [
					{
						type: "text" as const,
						text: "Расширение 1c-platform-tools недоступно по IPC. Откройте VS Code с проектом 1С и включите настройку 1c-platform-tools.ipc.enabled.",
					},
				],
			})
		);
	}

	for (const commandId of commandIds) {
		const toolName = commandIdToToolName(commandId);
		server.registerTool(
			toolName,
			{ inputSchema: baseParamsShape },
			async (input) => runTool(ipcClient, commandId, input as BaseParams)
		);
	}

	if (commandIds.length > 0) {
		logger.info(`MCP-сервер: зарегистрировано ${commandIds.length} инструментов`);
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
