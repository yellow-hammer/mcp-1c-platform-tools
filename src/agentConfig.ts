/**
 * Конфиг MCP в проекте для клиентов, которые не берут сервер у провайдера
 * MCP-серверов VS Code: Cursor (`.cursor/mcp.json`) и Claude Code (`.mcp.json`).
 *
 * Запись называет путь к серверу. Каталог, из которого клиент его запускает,
 * указывает окно. Путь к расширению содержит его версию, поэтому после обновления конфиг указывает на
 * несуществующий каталог и сервер падает с MODULE_NOT_FOUND. Модуль пишет
 * актуальный путь и чинит устаревший при запуске.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Имя сервера в конфиге агента. */
export const SERVER_NAME = "mcp-1c-platform-tools";

/** Признак записи, созданной этим расширением: каталог установленного расширения. */
const EXTENSION_DIR_MARKER = "yellow-hammer.mcp-1c-platform-tools";

/** Клиент MCP с конфигом в проекте. */
export interface AgentConfigTarget {
	/** Название клиента для сообщений. */
	label: string;
	/** Файл конфига относительно корня проекта. */
	file: string;
	/** Клиент добавляет новый сервер выключенным: запись включает его явно. */
	enables: boolean;
	/** Что сделать пользователю после записи конфига. */
	afterCreate: string;
	/** Что сделать пользователю, чтобы клиент подхватил исправленный конфиг. */
	afterUpdate: string;
}

/** Cursor: проектный `.cursor/mcp.json`. */
export const CURSOR: AgentConfigTarget = {
	label: "Cursor",
	file: path.join(".cursor", "mcp.json"),
	enables: true,
	afterCreate:
		"Перезагрузите окно, а затем включите сервер mcp-1c-platform-tools в настройках MCP: новый сервер Cursor добавляет выключенным.",
	afterUpdate: "Перезагрузите окно.",
};

/** Claude Code: проектный `.mcp.json`. */
export const CLAUDE_CODE: AgentConfigTarget = {
	label: "Claude Code",
	file: ".mcp.json",
	enables: false,
	afterCreate: "Запустите Claude Code в этой папке и разрешите сервер mcp-1c-platform-tools.",
	afterUpdate: "Перезапустите Claude Code.",
};

/** Параметры записи о сервере. */
export interface ServerConfig {
	/** Абсолютный путь к запускаемому файлу сервера. */
	serverPath: string;
	/** Папка рабочей области, в которую пишется конфиг. */
	workspace: string;
}

/** Результат обновления конфига. */
export type AgentConfigOutcome = "created" | "updated" | "unchanged";

function slashes(value: string): string {
	return value.replaceAll("\\", "/");
}

/**
 * Строит запись о сервере.
 *
 * @param target — клиент MCP
 * @param config — путь к серверу и папка рабочей области
 * @param keepEnv — переменные из прежней записи, которые сохраняются
 * @returns объект записи сервера
 */
export function buildServerEntry(
	target: AgentConfigTarget,
	config: ServerConfig,
	keepEnv: Record<string, string> = {}
): Record<string, unknown> {
	return {
		// Поле disabled понимают не все версии Cursor, поэтому о тумблере
		// пользователю сообщается и текстом
		...(target.enables ? { disabled: false } : {}),
		command: "node",
		args: [slashes(config.serverPath)],
		...(Object.keys(keepEnv).length > 0 ? { env: keepEnv } : {}),
	};
}

/**
 * Настройки сервера из прежней записи: таймаут ожидания, уровень журнала и
 * другие MCP_1C_*.
 */
function userSettings(entry: unknown): Record<string, string> {
	const env = (entry as { env?: unknown } | undefined)?.env;
	if (typeof env !== "object" || env === null) {
		return {};
	}
	return Object.fromEntries(
		Object.entries(env).filter(
			(pair): pair is [string, string] => pair[0].startsWith("MCP_1C_") && typeof pair[1] === "string"
		)
	);
}

/**
 * Указывает ли запись этого расширения на другую установку.
 *
 * Только такие записи обновляются автоматически: путь, заданный пользователем
 * вручную (например, на сборку из исходников), не трогаем.
 *
 * @param entry — запись сервера из конфига
 * @param config — актуальные путь к серверу и папка
 * @returns true, если запись создана этим расширением и устарела
 */
export function isStaleExtensionEntry(entry: unknown, config: ServerConfig): boolean {
	if (typeof entry !== "object" || entry === null) {
		return false;
	}
	const args = (entry as { args?: unknown }).args;
	if (!Array.isArray(args) || args.length === 0 || typeof args[0] !== "string") {
		return false;
	}
	const current = slashes(args[0]);
	if (!current.includes(EXTENSION_DIR_MARKER)) {
		return false;
	}
	return current !== slashes(config.serverPath);
}

/**
 * Создаёт или обновляет конфиг клиента в проекте.
 *
 * Другие серверы в конфиге сохраняются. При `onlyIfStale` запись обновляется
 * только когда она создана этим расширением и устарела — так автозапуск не
 * перетирает ручную настройку и не создаёт файл без спроса.
 *
 * @param target — клиент MCP
 * @param config — путь к серверу и папка рабочей области
 * @param onlyIfStale — обновлять только устаревшую запись, файл не создавать
 * @returns что было сделано с конфигом
 */
export async function writeAgentConfig(
	target: AgentConfigTarget,
	config: ServerConfig,
	onlyIfStale = false
): Promise<AgentConfigOutcome> {
	const configPath = path.join(config.workspace, target.file);

	let parsed: Record<string, unknown> = {};
	let existed = false;
	try {
		const raw = await fs.readFile(configPath, "utf8");
		const content = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
		if (typeof content === "object" && content !== null && !Array.isArray(content)) {
			parsed = content as Record<string, unknown>;
			existed = true;
		}
	} catch {
		// файла нет или он повреждён — создаём заново
	}

	const servers =
		typeof parsed.mcpServers === "object" && parsed.mcpServers !== null
			? (parsed.mcpServers as Record<string, unknown>)
			: {};
	const current = servers[SERVER_NAME];

	if (onlyIfStale && !isStaleExtensionEntry(current, config)) {
		return "unchanged";
	}

	servers[SERVER_NAME] = buildServerEntry(target, config, userSettings(current));
	parsed.mcpServers = servers;

	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, JSON.stringify(parsed, null, "\t") + "\n", "utf8");
	return existed ? "updated" : "created";
}
