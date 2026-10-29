/**
 * Сборка MCP-сервера: список команд расширения превращается в инструменты.
 *
 * Модуль не знает ни про stdio, ни про сокеты: команды приходят через
 * CommandGateway. Так сборку списка инструментов можно поднять в тестах и
 * проверить то, что видит агент, а не только отдельные функции.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommandDescriptor } from "./commandDescriptor.js";
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

/**
 * Сколько ждать появление окна после перезагрузки.
 *
 * Хост снимает запись из реестра и пишет её снова, когда канал открыт.
 * Сервер, стартовавший в этот промежуток, иначе фиксирует пустой список.
 */
export const WINDOW_APPEAR_WAIT_MS = 15_000;

/** Пауза между чтениями реестра, пока окно не появилось. */
const WINDOW_APPEAR_POLL_MS = 250;

/**
 * Ожидание окна.
 *
 * `MCP_1C_WINDOW_WAIT_MS` укорачивает его в тестах. В работе это {@link WINDOW_APPEAR_WAIT_MS}.
 *
 * @returns миллисекунды
 */
function windowAppearWaitMs(): number {
	const raw = Number.parseInt(process.env.MCP_1C_WINDOW_WAIT_MS ?? "", 10);
	return Number.isFinite(raw) && raw >= 0 ? raw : WINDOW_APPEAR_WAIT_MS;
}

/** Параметры сборки сервера. В тестах ожидание окна короче. */
export interface McpServerOptions {
	/** Сколько ждать окно при WINDOW_NOT_FOUND, мс. По умолчанию {@link WINDOW_APPEAR_WAIT_MS}. */
	windowWaitMs?: number;
	/** Пауза между попытками, мс. */
	pollMs?: number;
	/**
	 * После старта продолжать ждать окно и добавить инструменты, когда оно появится.
	 * По умолчанию включено.
	 */
	watch?: boolean;
}

/** Источник команд расширения: в работе это окна 1C: Platform Tools, в тестах подделка. */
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
	"Инструменты выполняют команды расширения 1C: Platform Tools в открытом окне VS Code или Cursor: тесты, сборка конфигурации и расширений, работа с информационной базой, профили запуска.",
	"",
	"Вызовы идут в окно, из которого запущен агент. Проект другого окна оно отклоняет с кодом WORKSPACE_MISMATCH и называет окно, где проект открыт. Агенту вне окон окно выбирается по projectPath. Если проект не открыт ни в одном окне (WINDOW_NOT_FOUND), откройте его в VS Code или Cursor (code <путь> или cursor <путь>) и повторите вызов. Папка, которой не доверяют, команды не выполняет, в том числе в других окнах: подтвердите доверие папке и повторите вызов.",
	"",
	"Начинайте с env_status: он покажет активный профиль запуска, файл настроек, версию vanessa-runner и строку подключения к ИБ. От окружения зависит, куда попадут изменения.",
	"",
	"В окне VS Code может быть несколько проектов (каталогов с packagedef), инструменты без projectPath выполняются в текущем. project_list возвращает проекты окна с их видом (designer и edt по формату исходного кода 1С, onec без исходного кода, onescript) и текущий проект, project_select с параметром root делает проект текущим, в том числе для пользователя. project_init создаёт packagedef в каталоге из обязательного projectPath (папка рабочей области или каталог из candidates ответа project_list) и делает этот проект текущим. У остальных инструментов projectPath выполняет один вызов в указанном проекте и текущий проект не меняет; относительный путь считается от текущего проекта.",
	"",
	"По умолчанию инструмент ждёт завершения операции и возвращает исход: сводку прогона тестов, ошибки синтаксического контроля, код возврата и хвост вывода. Ожидание длится до получаса. Передавайте wait: false, только если пользователь хочет смотреть выполнение в терминале сам: тогда ответ подтверждает лишь запуск.",
	"",
	"Неуспех приходит с признаком ошибки: упавшие тесты, ошибки проверки, ненулевой код возврата, обрыв связи с расширением. Такой ответ нельзя считать выполненной работой.",
	"",
	"Разовый прогон под другим файлом настроек задаётся параметром settingsFile, он не меняет активный профиль. Переключение профиля целиком - env_selectProfile.",
	"",
	"Повторяющуюся последовательность шагов запускают одной цепочкой: pipelines_run с параметром pipeline. Цепочки лежат в .1cpt/pipelines.json проекта, их можно править файлом по схеме pipelines.schema.json. Ответ - пошаговый отчёт: что выполнено, что упало, сколько попыток. Шаг с подтверждением в таком запуске завершается ошибкой: подтверждать некому.",
	"",
	"Данные информационной базы читаются и меняются через стандартный интерфейс OData: odata_query. Запрос идёт в автономный сервер проекта (server_start с опубликованным OData) или в свою публикацию из параметра url, учётная запись берётся из профиля запуска. POST, PATCH, PUT и DELETE меняют данные: вызывайте их только по явной просьбе пользователя, не заодно с чтением. Объект, которого нет в составе интерфейса, включает odata_setup с параметром include; без параметров он показывает текущий состав.",
].join("\n");

/**
 * Выполняет команду расширения и превращает её результат в ответ инструмента.
 *
 * @param gateway — источник команд расширения
 * @param commandId — идентификатор команды
 * @param params — параметры вызова инструмента
 * @param returnsOutcome — команда возвращает исход при wait: true
 * @returns текстовый ответ; неуспех помечается isError
 */
export async function runTool(
	gateway: CommandGateway,
	commandId: string,
	params: ToolParams,
	returnsOutcome = true
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
		const text = formatCommandResult(result, returnsOutcome);
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
 * Если окна ещё нет, сервер ждёт его и только потом оставляет заглушку.
 * Заглушка не снимается: клиент со старым списком вызывает её и получает
 * повторное подключение, а не отсутствие инструмента.
 *
 * @param gateway — источник команд расширения
 * @param version — версия сервера для ответа initialize
 * @param options — ожидание окна
 * @returns готовый сервер (транспорт подключает вызывающая сторона)
 */
export async function createMcpServer(
	gateway: CommandGateway,
	version: string,
	options: McpServerOptions = {}
): Promise<McpServer> {
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
					async (input) => runTool(gateway, descriptor.id, input as unknown as ToolParams, descriptor.supportsWait !== false)
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
	let windowMissing = false;
	try {
		descriptors = await commandsWhenWindowAppears(gateway, options);
	} catch (err) {
		windowMissing = isWindowNotFound(err);
		const message = err instanceof Error ? err.message : String(err);
		logger.warn(`Не удалось получить список команд: ${message}`);
	}

	const count = registerTools(descriptors);
	// Заглушка есть и когда инструменты уже зарегистрированы: чат со старым
	// списком вызывает её у нового процесса.
	registerPlaceholder(server, gateway, registerTools, usedNames);
	if (count > 0) {
		logger.info(`MCP-сервер: зарегистрировано ${count} инструментов`);
	} else if (windowMissing && options.watch !== false) {
		void watchForWindow(server, gateway, registerTools, options.pollMs ?? WINDOW_APPEAR_POLL_MS);
	}

	return server;
}

/**
 * Окно появилось после старта: добавляет инструменты и сообщает клиенту.
 *
 * @param server — уже собранный сервер
 * @param gateway — источник команд
 * @param registerTools — регистрация по описаниям
 * @param pollMs — пауза между чтениями реестра
 */
async function watchForWindow(
	server: McpServer,
	gateway: CommandGateway,
	registerTools: (descriptors: CommandDescriptor[]) => number,
	pollMs: number
): Promise<void> {
	let stopped = false;
	const low = server.server;
	const previous = low.onclose;
	low.onclose = () => {
		stopped = true;
		previous?.();
	};
	while (!stopped) {
		await sleep(pollMs);
		if (stopped) {
			return;
		}
		try {
			const late = await gateway.listCommandDescriptors();
			if (late.length === 0) {
				continue;
			}
			const added = registerTools(late);
			if (added > 0) {
				logger.info(`MCP-сервер: окно появилось, зарегистрировано ${added} инструментов`);
			}
			return;
		} catch (err) {
			if (!isWindowNotFound(err)) {
				return;
			}
		}
	}
}

/**
 * Читает команды окна.
 *
 * При WINDOW_NOT_FOUND повторяет чтение, пока окно не появится или не выйдет
 * время ожидания. Другие отказы возвращаются сразу.
 *
 * @param gateway — источник команд расширения
 * @param options — сколько ждать и как часто повторять
 * @returns описания команд
 */
async function commandsWhenWindowAppears(
	gateway: CommandGateway,
	options: McpServerOptions
): Promise<CommandDescriptor[]> {
	const waitMs = options.windowWaitMs ?? windowAppearWaitMs();
	const pollMs = options.pollMs ?? WINDOW_APPEAR_POLL_MS;
	const deadline = Date.now() + Math.max(0, waitMs);
	let announced = false;
	for (;;) {
		try {
			return await gateway.listCommandDescriptors();
		} catch (err) {
			const missing = isWindowNotFound(err);
			if (!missing || Date.now() >= deadline) {
				throw err;
			}
			if (!announced) {
				logger.info("Окно ещё не в реестре, сервер подождёт его");
				announced = true;
			}
			await sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
		}
	}
}

/** Окна ещё нет: код отказа шлюза, без привязки к клиенту канала. */
function isWindowNotFound(err: unknown): boolean {
	return typeof err === "object" && err !== null && "code" in err && err.code === "WINDOW_NOT_FOUND";
}

/** @param ms — пауза */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Регистрирует заглушку, которая повторяет подключение к расширению.
 *
 * Инструмент не снимается. Иначе клиент со старым списком получает
 * отсутствие инструмента вместо повторного подключения.
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
	if (usedNames.has("onec_platform_tools_status")) {
		return;
	}
	usedNames.add("onec_platform_tools_status");
	server.registerTool(
		"onec_platform_tools_status",
		{
			description:
				"Состояние подключения к расширению 1C: Platform Tools. " +
				"Вызовите, если инструментов 1С не видно: сервер повторит подключение.",
		},
		async (): Promise<ToolResult> => {
			let reason: string;
			try {
				const late = await gateway.listCommandDescriptors();
				const added = registerTools(late);
				if (late.length > 0) {
					// Регистрация нового инструмента уже шлёт list_changed.
					// Повторный вызов, когда список уже собран, шлёт его сам:
					// клиент со старым списком иначе его не увидит.
					if (added === 0) {
						server.sendToolListChanged();
					}
					logger.info(
						added > 0
							? `MCP-сервер: зарегистрировано ${added} инструментов после повторного подключения`
							: "MCP-сервер: инструменты уже зарегистрированы, клиенту отправлен новый список"
					);
					return {
						content: [
							{
								type: "text",
								text: `Расширение подключено, доступно инструментов: ${late.length}. Повторите вызов нужного инструмента.`,
							},
						],
					};
				}
				reason = "окно отозвалось, но команд не дало";
			} catch (retryError) {
				reason = retryError instanceof Error ? retryError.message : String(retryError);
				logger.warn(`Повторное подключение не удалось: ${reason}`);
			}
			return {
				content: [
					{
						type: "text",
						text: `Нет связи с 1C: Platform Tools: ${reason}`,
					},
				],
				isError: true,
			};
		}
	);
}
