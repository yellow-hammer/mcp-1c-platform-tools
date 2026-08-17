/**
 * Сборка MCP-сервера: список команд расширения превращается в инструменты.
 *
 * Модуль не знает ни про stdio, ни про сокеты: команды приходят через
 * CommandGateway. Так сборку списка инструментов можно поднять в тестах и
 * проверить то, что видит агент, а не только отдельные функции.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommandDescriptor } from "./ipcClient.js";
import { formatCommandResult, isFailedResult } from "./formatCommandResult.js";
import { logger } from "./loggerServer.js";
import { describeCommand, uniqueToolName } from "./toolName.js";
import { paramsForCommand } from "./toolParams.js";

/**
 * Таймаут для команд без ожидания (мс).
 * Команда уходит в терминал VS Code и возвращает управление сразу.
 */
export const TIMEOUT_DEFAULT_MS = 60_000;

/**
 * Таймаут синхронных команд (мс).
 *
 * Полный прогон тестов или сборка большой конфигурации идут дольше нескольких
 * минут, поэтому предел поднимается переменной MCP_1C_WAIT_TIMEOUT_MS.
 */
export function readWaitTimeout(): number {
	const raw = Number.parseInt(process.env.MCP_1C_WAIT_TIMEOUT_MS ?? "", 10);
	return Number.isFinite(raw) && raw > 0 ? raw : 1_800_000;
}

/** Источник команд расширения: в работе это IPC-клиент, в тестах подделка. */
export interface CommandGateway {
	/** Список команд расширения с заголовками. */
	listCommandDescriptors(): Promise<CommandDescriptor[]>;
	/** Выполняет команду расширения и возвращает её результат. */
	executeCommand(
		commandId: string,
		args: unknown[] | undefined,
		projectPath: string | undefined,
		timeoutMs?: number
	): Promise<unknown>;
}

/**
 * Параметры вызова инструмента: набор полей зависит от команды.
 *
 * Поля, кроме projectPath и wait, уходят команде расширения как есть, поэтому
 * новый параметр в схеме инструмента ({@link paramsForCommand}) начинает работать
 * без правок здесь.
 */
export interface ToolParams {
	projectPath?: string;
	wait?: boolean;
	[option: string]: unknown;
}

/** Ответ инструмента MCP. */
type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

/**
 * Что агенту полезно знать до первого вызова: клиент получает этот текст при
 * инициализации сервера. Без него правила приходится выяснять по ошибкам.
 */
export const SERVER_INSTRUCTIONS = [
	"Инструменты выполняют команды расширения 1C: Platform Tools в открытом VS Code: тесты, сборка конфигурации и расширений, работа с информационной базой, профили запуска.",
	"",
	"Начинайте с onec_env_status: он покажет активный профиль запуска, файл настроек, версию vanessa-runner и строку подключения к ИБ. От окружения зависит, куда попадут изменения.",
	"",
	"projectPath указывает корень проекта 1С (каталог с packagedef или env.json). Если в VS Code открыт один проект, параметр можно не передавать.",
	"",
	"По умолчанию инструмент ждёт завершения операции и возвращает исход: сводку прогона тестов, ошибки синтаксического контроля, код возврата и хвост вывода. Ожидание длится до получаса. Передавайте wait: false, только если пользователь хочет смотреть выполнение в терминале сам: тогда ответ подтверждает лишь запуск.",
	"",
	"Неуспех приходит с признаком ошибки: упавшие тесты, ошибки проверки, ненулевой код возврата, обрыв связи с расширением. Такой ответ нельзя считать выполненной работой.",
	"",
	"Разовый прогон под другим файлом настроек задаётся параметром settingsFile, он не меняет активный профиль. Переключение профиля целиком - onec_env_selectProfile.",
	"",
	"Повторяющуюся последовательность шагов запускают одной цепочкой: onec_pipelines_run с параметром pipeline. Цепочки лежат в .1cpt/pipelines.json проекта, их можно править файлом по схеме pipelines.schema.json. Ответ - пошаговый отчёт: что выполнено, что упало, сколько попыток. Шаг с подтверждением в таком запуске завершается ошибкой: подтверждать некому.",
].join("\n");

/**
 * Выполняет команду расширения и превращает её результат в ответ инструмента.
 *
 * @param gateway — источник команд расширения
 * @param commandId — идентификатор команды
 * @param params — параметры вызова инструмента
 * @returns текстовый ответ; неуспех помечается isError
 */
export async function runTool(
	gateway: CommandGateway,
	commandId: string,
	params: ToolParams
): Promise<ToolResult> {
	const wait = params.wait ?? true;
	const timeoutMs = wait ? readWaitTimeout() : TIMEOUT_DEFAULT_MS;
	// projectPath адресует проект, wait управляет ожиданием; остальное - параметры
	// самой команды, и они уходят расширению без перечисления по именам.
	const { projectPath, wait: _wait, ...commandOptions } = params;

	try {
		const result = await gateway.executeCommand(
			commandId,
			[{ wait, ...commandOptions }],
			projectPath,
			timeoutMs
		);
		const text = formatCommandResult(result);
		return isFailedResult(result)
			? { content: [{ type: "text", text }], isError: true }
			: { content: [{ type: "text", text }] };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.error(`runTool ${commandId}: ${message}`);
		return {
			content: [{ type: "text", text: `Не удалось выполнить команду: ${message}` }],
			isError: true,
		};
	}
}

/**
 * Собирает MCP-сервер с инструментами по списку команд расширения.
 *
 * Если расширение недоступно, вместо инструментов регистрируется заглушка:
 * она повторяет подключение и добавляет инструменты на месте, поэтому список
 * не остаётся пустым до перезапуска сервера.
 *
 * @param gateway — источник команд расширения
 * @param version — версия сервера для ответа initialize
 * @returns готовый сервер (транспорт подключает вызывающая сторона)
 */
export async function createMcpServer(gateway: CommandGateway, version: string): Promise<McpServer> {
	const server = new McpServer(
		{ name: "mcp-1c-platform-tools", version },
		{ capabilities: { tools: { listChanged: true } }, instructions: SERVER_INSTRUCTIONS }
	);

	const registered = new Set<string>();
	const usedNames = new Set<string>();

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
					async (input) => runTool(gateway, descriptor.id, input as unknown as ToolParams)
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
		descriptors = await gateway.listCommandDescriptors();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(
			`Не удалось получить список команд по IPC: ${message}. ` +
			"Включите расширение 1c-platform-tools и настройку 1c-platform-tools.ipc.enabled."
		);
		registerPlaceholder(server, gateway, registerTools, usedNames);
	}

	const count = registerTools(descriptors);
	if (count > 0) {
		logger.info(`MCP-сервер: зарегистрировано ${count} инструментов`);
	}

	return server;
}

/**
 * Регистрирует заглушку, которая повторяет подключение к расширению.
 *
 * @param server — собираемый сервер
 * @param gateway — источник команд расширения
 * @param registerTools — регистрация инструментов по описаниям команд
 * @param usedNames — занятые имена инструментов
 */
function registerPlaceholder(
	server: McpServer,
	gateway: CommandGateway,
	registerTools: (descriptors: CommandDescriptor[]) => number,
	usedNames: Set<string>
): void {
	usedNames.add("onec_platform_tools_status");
	const placeholder = server.registerTool(
		"onec_platform_tools_status",
		{
			description:
				"Состояние подключения к расширению 1C: Platform Tools. " +
				"Вызовите, если инструментов 1С не видно: сервер повторит подключение.",
		},
		async (): Promise<ToolResult> => {
			try {
				const late = await gateway.listCommandDescriptors();
				const added = registerTools(late);
				if (added > 0) {
					placeholder.remove();
					logger.info(`MCP-сервер: зарегистрировано ${added} инструментов после повторного подключения`);
					return {
						content: [
							{
								type: "text",
								text: `Расширение отозвалось, доступно инструментов: ${added}. Повторите вызов нужного инструмента.`,
							},
						],
					};
				}
			} catch (retryError) {
				const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
				logger.warn(`Повторное подключение по IPC не удалось: ${retryMessage}`);
			}
			return {
				content: [
					{
						type: "text",
						text: "Расширение 1c-platform-tools недоступно по IPC. Откройте VS Code с проектом 1С и включите настройку 1c-platform-tools.ipc.enabled.",
					},
				],
				isError: true,
			};
		}
	);
}
