/**
 * Конфиг MCP для агентов, которые не поддерживают провайдер MCP-серверов VS Code
 * (Cursor): путь к серверу прописывается в `.cursor/mcp.json` проекта.
 *
 * Путь к расширению содержит его версию, поэтому после обновления конфиг
 * указывает на несуществующий каталог и сервер падает с MODULE_NOT_FOUND.
 * Модуль пишет актуальный путь и чинит устаревший при запуске.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Имя сервера в конфиге агента. */
export const SERVER_NAME = "mcp-1c-platform-tools";

/** Признак записи, созданной этим расширением: каталог установленного расширения. */
const EXTENSION_DIR_MARKER = "yellow-hammer.mcp-1c-platform-tools";

/** Параметры записи о сервере. */
export interface CursorServerConfig {
	/** Абсолютный путь к запускаемому файлу сервера. */
	serverPath: string;
	/** Порт IPC расширения 1c-platform-tools. */
	port: number;
	/** Токен IPC (пустая строка — без токена). */
	token: string;
}

/** Результат обновления конфига. */
export type CursorConfigOutcome = "created" | "updated" | "unchanged";

/**
 * Строит запись о сервере для `.cursor/mcp.json`.
 *
 * @param config - Путь к серверу и параметры IPC
 * @returns Объект записи сервера
 */
export function buildServerEntry(config: CursorServerConfig): Record<string, unknown> {
	return {
		command: "node",
		args: [config.serverPath.replaceAll("\\", "/")],
		env: {
			ONEC_IPC_HOST: "127.0.0.1",
			ONEC_IPC_PORT: String(config.port),
			ONEC_IPC_TOKEN: config.token,
		},
	};
}

/**
 * Указывает ли запись на другую установку этого же расширения.
 *
 * Только такие записи обновляются автоматически: путь, заданный пользователем
 * вручную (например, на сборку из исходников), не трогаем.
 *
 * @param entry - Запись сервера из конфига
 * @param serverPath - Актуальный путь к серверу
 * @returns true, если запись устарела и создана этим расширением
 */
export function isStaleExtensionEntry(entry: unknown, serverPath: string): boolean {
	if (typeof entry !== "object" || entry === null) {
		return false;
	}
	const args = (entry as { args?: unknown }).args;
	if (!Array.isArray(args) || args.length === 0 || typeof args[0] !== "string") {
		return false;
	}
	const current = args[0].replaceAll("\\", "/");
	const actual = serverPath.replaceAll("\\", "/");
	return current !== actual && current.includes(EXTENSION_DIR_MARKER);
}

/**
 * Создаёт или обновляет `.cursor/mcp.json` проекта.
 *
 * Другие серверы в конфиге сохраняются. При `onlyIfStale` запись обновляется
 * только когда она указывает на другую установку этого расширения — так
 * автозапуск не перетирает ручную настройку и не создаёт файл без спроса.
 *
 * @param workspaceRoot - Корень проекта
 * @param config - Путь к серверу и параметры IPC
 * @param onlyIfStale - Обновлять только устаревшую запись, файл не создавать
 * @returns Что было сделано с конфигом
 */
export async function writeCursorConfig(
	workspaceRoot: string,
	config: CursorServerConfig,
	onlyIfStale = false
): Promise<CursorConfigOutcome> {
	const configPath = path.join(workspaceRoot, ".cursor", "mcp.json");

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

	if (onlyIfStale && !isStaleExtensionEntry(current, config.serverPath)) {
		return "unchanged";
	}

	servers[SERVER_NAME] = buildServerEntry(config);
	parsed.mcpServers = servers;

	await fs.mkdir(path.dirname(configPath), { recursive: true });
	await fs.writeFile(configPath, JSON.stringify(parsed, null, "\t") + "\n", "utf8");
	return existed ? "updated" : "created";
}
