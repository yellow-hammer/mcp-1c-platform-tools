/**
 * Логгер расширения: пишет в Output Channel VS Code.
 * Уровень задаётся настройкой 1c-platform-tools.logLevel (error | warnings | info | debug).
 */
import * as vscode from "vscode";

/** Уровни логирования: чем больше число, тем подробнее вывод. */
const LOG_LEVELS = {
	error: 0,
	warnings: 1,
	info: 2,
	debug: 3,
} as const;

export type LogLevelName = keyof typeof LOG_LEVELS;

const OUTPUT_CHANNEL_NAME = "MCP 1C Platform Tools";

let outputChannel: vscode.OutputChannel | undefined;

/** Возвращает или создаёт канал вывода. */
function getChannel(): vscode.OutputChannel {
	outputChannel ??= vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
	return outputChannel;
}

/** Уровень из настроек 1c-platform-tools (общий с основным расширением) */
function getConfiguredLevel(): number {
	const config = vscode.workspace.getConfiguration("1c-platform-tools");
	const name = config.get<LogLevelName>("logLevel", "info");
	return LOG_LEVELS[name] ?? LOG_LEVELS.info;
}

/** Форматирует строку лога: [ISO-time] [level] message */
function formatMessage(level: string, message: string): string {
	const time = new Date().toISOString();
	return `[${time}] [${level}] ${message}`;
}

/** Пишет в канал, если уровень сообщения не выше настроенного. */
function log(level: LogLevelName, message: string): void {
	const configured = getConfiguredLevel();
	const currentLevel = LOG_LEVELS[level];
	if (currentLevel > configured) {
		return;
	}
	getChannel().appendLine(formatMessage(level, message));
}

/** Объект логгера: error, warn, info, debug, show, dispose. */
export const logger = {
	/** Лог уровня error (всегда выводится). */
	error(message: string): void {
		log("error", message);
	},

	/** Лог уровня warnings. */
	warn(message: string): void {
		log("warnings", message);
	},

	/** Лог уровня info. */
	info(message: string): void {
		log("info", message);
	},

	/** Лог уровня debug. */
	debug(message: string): void {
		log("debug", message);
	},

	/** Показывает панель вывода в UI. */
	show(): void {
		getChannel().show();
	},

	/** Освобождает канал вывода. */
	dispose(): void {
		if (outputChannel) {
			outputChannel.dispose();
			outputChannel = undefined;
		}
	},
};
