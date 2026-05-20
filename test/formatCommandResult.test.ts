/**
 * Тесты formatCommandResult: преобразование результата команды в строку ответа инструмента.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatCommandResult } from "../src/formatCommandResult.js";

describe("formatCommandResult", () => {
	it("null/undefined → сообщение о UI-режиме с подсказкой wait: true", () => {
		const msgNull = formatCommandResult(null);
		assert.ok(
			msgNull.includes("UI-терминале"),
			`ожидалось упоминание UI-терминала, получено: "${msgNull}"`
		);
		assert.ok(
			formatCommandResult(undefined).includes("wait: true"),
			"ожидалась подсказка wait: true для undefined"
		);
	});

	it("строка: пустая → 'Выполнено.', непустая → trim без префикса", () => {
		assert.strictEqual(formatCommandResult(""), "Выполнено.");
		assert.strictEqual(formatCommandResult("   "), "Выполнено.");
		assert.strictEqual(formatCommandResult("ok"), "ok");
		assert.strictEqual(formatCommandResult("  msg  "), "msg");
	});

	describe("структурированный результат (wait: true)", () => {
		it("успех: содержит 'Успех' и не содержит 'Ошибка'", () => {
			const result = formatCommandResult({ success: true, exitCode: 0 });
			assert.ok(result.includes("Успех"), `ожидалось 'Успех', получено: "${result}"`);
			assert.ok(!result.includes("Ошибка"), `не ожидалось 'Ошибка', получено: "${result}"`);
		});

		it("ошибка: содержит 'Ошибка' и exitCode", () => {
			const result = formatCommandResult({ success: false, exitCode: 1 });
			assert.ok(result.includes("Ошибка"), `ожидалось 'Ошибка', получено: "${result}"`);
			assert.ok(result.includes("exitCode: 1"), `ожидалось 'exitCode: 1', получено: "${result}"`);
		});

		it("включает путь к артефакту", () => {
			const result = formatCommandResult({
				success: true,
				exitCode: 0,
				artifact: "build/out/epf/Test.epf",
			});
			assert.ok(
				result.includes("build/out/epf/Test.epf"),
				`артефакт не найден в выводе: "${result}"`
			);
		});

		it("включает время выполнения", () => {
			const result = formatCommandResult({
				success: true,
				exitCode: 0,
				durationMs: 5500,
			});
			assert.ok(result.includes("5.5 с"), `время не найдено в выводе: "${result}"`);
		});

		it("включает stdout и stderr", () => {
			const result = formatCommandResult({
				success: false,
				exitCode: 1,
				stdout: "ИНФОРМАЦИЯ - Собирали: QWEP",
				stderr: "ОШИБКА - Модуль не найден",
			});
			assert.ok(
				result.includes("ИНФОРМАЦИЯ - Собирали"),
				`stdout не найден в выводе: "${result}"`
			);
			assert.ok(
				result.includes("ОШИБКА - Модуль не найден"),
				`stderr не найден в выводе: "${result}"`
			);
		});

		it("включает список ошибок синтакс-проверки с позицией и режимом", () => {
			const result = formatCommandResult({
				success: false,
				exitCode: 1,
				errors: [
					{
						filepath: "src/CommonModules/МодульМенеджера.bsl",
						line: 42,
						column: 10,
						severity: "error" as const,
						message: "Переменная не определена",
						mode: "Server",
					},
					{
						filepath: "src/Documents/Заказ/ДокументМодуль.bsl",
						line: 7,
						severity: "warning" as const,
						message: "Неиспользуемая переменная",
					},
				],
			});
			assert.ok(result.includes("Ошибки (2)"), `счётчик ошибок не найден: "${result}"`);
			assert.ok(result.includes(":42:10"), `позиция :42:10 не найдена: "${result}"`);
			assert.ok(result.includes("[Server]"), `режим [Server] не найден: "${result}"`);
			assert.ok(
				result.includes("Переменная не определена"),
				`сообщение не найдено: "${result}"`
			);
			assert.ok(result.includes(":7"), `строка второй ошибки не найдена: "${result}"`);
		});

		it("пустые stdout/stderr не добавляются в вывод", () => {
			const result = formatCommandResult({
				success: true,
				exitCode: 0,
				stdout: "",
				stderr: "   ",
			});
			assert.ok(!result.includes("Вывод:"), `пустой stdout не должен добавляться: "${result}"`);
			assert.ok(
				!result.includes("вывод ошибок:"),
				`пустой stderr не должен добавляться: "${result}"`
			);
		});
	});

	describe("объект без success/exitCode (старый формат)", () => {
		it("приоритет: stdout → stderr → message", () => {
			assert.strictEqual(formatCommandResult({ stdout: "out" }), "out");
			assert.strictEqual(formatCommandResult({ stderr: "err" }), "err");
			assert.strictEqual(formatCommandResult({ message: "msg" }), "msg");
			assert.strictEqual(
				formatCommandResult({ stdout: "a", stderr: "b", message: "c" }),
				"a"
			);
		});

		it("пустые поля → 'Выполнено.'", () => {
			assert.strictEqual(formatCommandResult({ stdout: "" }), "Выполнено.");
			assert.strictEqual(formatCommandResult({ stderr: "  " }), "Выполнено.");
			assert.strictEqual(formatCommandResult({}), "Выполнено.");
		});
	});

	it("примитивы (не строки) → 'Выполнено.'", () => {
		assert.strictEqual(formatCommandResult(42), "Выполнено.");
		assert.strictEqual(formatCommandResult(true), "Выполнено.");
	});
});
