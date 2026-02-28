/**
 * Логгер для MCP-сервера (процесс stdio без VS Code API).
 * Пишет в stderr с тем же форматом, что и logger в расширении.
 * Уровень: переменная окружения MCP_1C_LOG_LEVEL (error | warnings | info | debug), по умолчанию info.
 */

/** Уровни логирования: чем больше число, тем подробнее вывод. */
const LOG_LEVELS = {
	error: 0,
	warnings: 1,
	info: 2,
	debug: 3,
} as const;

type LogLevelName = keyof typeof LOG_LEVELS;

/** Читает уровень из MCP_1C_LOG_LEVEL. */
function getConfiguredLevel(): number {
	const name = (process.env.MCP_1C_LOG_LEVEL ?? "info").toLowerCase() as LogLevelName;
	return LOG_LEVELS[name] ?? LOG_LEVELS.info;
}

/** Форматирует строку лога: [ISO-time] [level] message */
function formatMessage(level: string, message: string): string {
	const time = new Date().toISOString();
	return `[${time}] [${level}] ${message}`;
}

/** Пишет в stderr, если уровень сообщения не выше настроенного. */
function log(level: LogLevelName, message: string): void {
	const configured = getConfiguredLevel();
	const currentLevel = LOG_LEVELS[level];
	if (currentLevel > configured) {
		return;
	}
	process.stderr.write(formatMessage(level, message) + "\n");
}

/** Объект логгера для standalone-процесса (error, warn, info, debug). */
export const logger = {
	error(message: string): void {
		log("error", message);
	},

	warn(message: string): void {
		log("warnings", message);
	},

	info(message: string): void {
		log("info", message);
	},

	debug(message: string): void {
		log("debug", message);
	},
};
