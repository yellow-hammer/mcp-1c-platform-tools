/**
 * Преобразование результата команды расширения в строку для ответа MCP-инструмента.
 */

/**
 * Структурированный результат синхронного выполнения команды (wait: true).
 * Возвращается расширением 1c-platform-tools при выполнении операций в синхронном режиме.
 */
export interface StructuredCommandResult {
	/** Признак успешного завершения (exitCode === 0). */
	success: boolean;
	/** Код возврата процесса (0 = успех). */
	exitCode: number;
	/** Стандартный вывод процесса. */
	stdout?: string;
	/** Стандартный вывод ошибок процесса. */
	stderr?: string;
	/** Путь к итоговому артефакту (.epf, .cf, .cfe, отчёту и т.п.). */
	artifact?: string;
	/** ISO-строка времени начала операции. */
	startedAt?: string;
	/** ISO-строка времени окончания операции. */
	finishedAt?: string;
	/** Продолжительность операции в миллисекундах. */
	durationMs?: number;
	/** Ошибки синтакс-проверки (только для test_syntaxCheck). */
	errors?: StructuredSyntaxError[];
}

/**
 * Одна ошибка синтакс-проверки с привязкой к файлу и строке.
 */
export interface StructuredSyntaxError {
	/** Путь к файлу с ошибкой. */
	filepath: string;
	/** Номер строки (если доступен). */
	line?: number;
	/** Номер столбца (если доступен). */
	column?: number;
	/** Уровень серьёзности. */
	severity?: "error" | "warning";
	/** Текст сообщения. */
	message: string;
	/** Режим проверки (ThinClient, Server, …). */
	mode?: string;
}

/**
 * Определяет, является ли значение структурированным результатом команды.
 *
 * @param value — произвольное значение
 * @returns true, если value содержит поля success (boolean) и exitCode (number)
 */
function isStructuredResult(value: unknown): value is StructuredCommandResult {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const o = value as Record<string, unknown>;
	return typeof o.success === "boolean" && typeof o.exitCode === "number";
}

/**
 * Форматирует структурированный результат в читаемую строку для агента.
 *
 * @param r — структурированный результат выполнения команды
 * @returns многострочная строка с итогом, артефактом, выводом и ошибками
 */
function formatStructured(r: StructuredCommandResult): string {
	const lines: string[] = [];

	if (r.success) {
		lines.push("Успех");
	} else {
		lines.push(`Ошибка (exitCode: ${r.exitCode})`);
	}

	if (r.artifact) {
		lines.push(`Артефакт: ${r.artifact}`);
	}

	if (r.durationMs != null) {
		lines.push(`Время выполнения: ${(r.durationMs / 1000).toFixed(1)} с`);
	}

	const stdout = r.stdout?.trim();
	if (stdout) {
		lines.push(`\nВывод:\n${stdout}`);
	}

	const stderr = r.stderr?.trim();
	if (stderr) {
		lines.push(`\nСтандартный вывод ошибок:\n${stderr}`);
	}

	if (r.errors && r.errors.length > 0) {
		lines.push(`\nОшибки (${r.errors.length}):`);
		for (const e of r.errors) {
			const loc = e.line != null
				? `:${e.line}${e.column != null ? `:${e.column}` : ""}`
				: "";
			const mode = e.mode ? ` [${e.mode}]` : "";
			lines.push(`  ${e.filepath}${loc} — ${e.message}${mode}`);
		}
	}

	return lines.join("\n");
}

/**
 * Преобразует результат команды расширения в строку для ответа инструмента.
 *
 * Поддерживает три формата результата:
 * - структурированный { success, exitCode, stdout, stderr, artifact, errors } — возвращается при wait: true;
 * - строка — возвращается некоторыми командами напрямую;
 * - null/undefined — команда выполнена в UI-терминале без возврата данных.
 *
 * @param result — значение, возвращённое executeCommand
 * @returns читаемая строка для агента
 */
export function formatCommandResult(result: unknown): string {
	if (result === undefined || result === null) {
		return "Команда запущена в UI-терминале. Результат выполнения отображается в панели 1C: Platform Tools. Для получения структурированного вывода используйте параметр wait: true.";
	}

	if (typeof result === "string") {
		return result.trim() === "" ? "Выполнено." : result.trim();
	}

	if (isStructuredResult(result)) {
		return formatStructured(result);
	}

	if (typeof result === "object") {
		const o = result as Record<string, unknown>;
		if (typeof o.stdout === "string" && o.stdout.trim() !== "") {
			return o.stdout.trim();
		}
		if (typeof o.stderr === "string" && o.stderr.trim() !== "") {
			return o.stderr.trim();
		}
		if (typeof o.message === "string" && o.message.trim() !== "") {
			return o.message.trim();
		}
	}

	return "Выполнено.";
}
