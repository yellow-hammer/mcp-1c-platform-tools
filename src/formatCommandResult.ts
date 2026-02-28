/**
 * Преобразование результата команды расширения в строку для ответа MCP-инструмента.
 */

/**
 * Преобразует результат команды расширения в строку для ответа инструмента.
 *
 * @param result — значение, возвращённое executeCommand
 * @returns читаемая строка (stdout/stderr/message или "Выполнено.")
 */
export function formatCommandResult(result: unknown): string {
	if (result === undefined || result === null) {
		return "Выполнено.";
	}
	if (typeof result === "string") {
		return result.trim() === "" ? "Выполнено." : `Выполнено. ${result}`;
	}
	if (typeof result === "object" && result !== null) {
		const o = result as Record<string, unknown>;
		if (typeof o.stdout === "string" && o.stdout.trim() !== "") {
			return `Выполнено. stdout: ${o.stdout}`;
		}
		if (typeof o.stderr === "string" && o.stderr.trim() !== "") {
			return `Выполнено. stderr: ${o.stderr}`;
		}
		if (typeof o.message === "string" && o.message.trim() !== "") {
			return `Выполнено. ${o.message}`;
		}
	}
	return "Выполнено.";
}
