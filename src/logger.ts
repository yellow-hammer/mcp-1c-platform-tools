/**
 * Логгер расширения: пишет в собственный LogOutputChannel VS Code
 * («1C: Platform Tools MCP»). Уровень, таймстемп и фильтрацию по уровню
 * обеспечивает сам VS Code (селектор уровня у канала Output / «Developer: Set Log Level…»).
 */
import * as vscode from "vscode";

const OUTPUT_CHANNEL_NAME = "1C: Platform Tools MCP";

let outputChannel: vscode.LogOutputChannel | undefined;

/** Возвращает или создаёт канал вывода с поддержкой уровней. */
function getChannel(): vscode.LogOutputChannel {
	outputChannel ??= vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME, { log: true });
	return outputChannel;
}

/** Объект логгера: error, warn, info, debug, show, dispose. */
export const logger = {
	/** Лог уровня error. */
	error(message: string): void {
		getChannel().error(message);
	},

	/** Лог уровня warning. */
	warn(message: string): void {
		getChannel().warn(message);
	},

	/** Лог уровня info. */
	info(message: string): void {
		getChannel().info(message);
	},

	/** Лог уровня debug. */
	debug(message: string): void {
		getChannel().debug(message);
	},

	/** Показывает панель вывода в UI. */
	show(): void {
		getChannel().show();
	},

	/** Освобождает канал вывода. */
	dispose(): void {
		outputChannel?.dispose();
		outputChannel = undefined;
	},
};
