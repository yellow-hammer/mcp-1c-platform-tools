/**
 * Тесты formatCommandResult: преобразование результата команды в строку ответа инструмента.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatCommandResult, clampOutput, formatData, isFailedResult } from "../src/formatCommandResult.js";

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

		it("перечисляет собранные файлы, когда их несколько", () => {
			const result = formatCommandResult({
				success: true,
				exitCode: 0,
				artifacts: ["build/release/Первое-1.0.cfe", "build/release/Второе-2.0.cfe"],
			});
			assert.ok(result.includes("Артефакты:\n  - build/release/Первое-1.0.cfe\n  - build/release/Второе-2.0.cfe"), result);
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

	it("тестовая сводка: не пройдено и упавшие в ответе", () => {
		const text = formatCommandResult({
			success: true,
			exitCode: 0,
			stdout: "",
			stderr: "",
			tests: {
				total: 3, passed: 1, failed: 2, errors: 0, skipped: 0,
				reportPath: "build/out/junit", failedTests: ["Смоук: Красный"],
			},
		});
		assert.match(text, /Тесты не пройдены: упало 2/);
		assert.match(text, /Смоук: Красный/);
		assert.doesNotMatch(text, /^Успех/m);
	});

	it("тестовая сводка: зелёный прогон с количеством", () => {
		const text = formatCommandResult({
			success: true,
			exitCode: 0,
			stdout: "",
			stderr: "",
			tests: {
				total: 5, passed: 5, failed: 0, errors: 0, skipped: 0,
				reportPath: "build/out/junit", failedTests: [],
			},
		});
		assert.match(text, /Тесты пройдены: 5 из 5/);
	});
});

describe("formatCommandResult: проект и данные команды", () => {
	it("корень проекта, в котором выполнилась команда, виден в ответе", () => {
		const text = formatCommandResult({ success: true, exitCode: 0, projectRoot: "C:/work/erp" });
		assert.match(text, /Проект: C:\/work\/erp/);
	});

	it("данные команды без вывода приходят JSON", () => {
		const text = formatCommandResult({
			success: true,
			exitCode: 0,
			stdout: "",
			data: { current: "C:/work/erp", projects: [{ root: "C:/work/erp", name: "erp" }] },
		});
		assert.match(text, /Данные:/);
		assert.match(text, /"current": "C:\/work\/erp"/);
	});

	it("большой список проектов приходит целиком: текущий проект и первые проекты не теряются", () => {
		const projects = Array.from({ length: 400 }, (_, index) => ({
			root: `C:/work/project-${index}`,
			name: `project-${index}`,
			subProject: false,
			current: index === 0,
		}));
		const data = { current: "C:/work/project-0", projects, candidates: [] };

		const text = formatCommandResult({ success: true, exitCode: 0, stdout: "", data });

		assert.ok(JSON.stringify(data, null, 2).length > 12_000);
		assert.doesNotMatch(text, /пропущено/);
		assert.deepStrictEqual(JSON.parse(text.slice(text.indexOf("{"))), data);
	});
});

describe("formatData", () => {
	it("данные с отступами, пока помещаются", () => {
		assert.strictEqual(formatData({ a: 1 }), '{\n  "a": 1\n}');
	});

	it("большие данные идут в одну строку, а сверх предела режутся с конца", () => {
		const value = Array.from({ length: 1_800 }, (_, index) => ({ index, text: "x".repeat(20) }));
		const compact = formatData({ value });
		assert.ok(!compact.includes("\n  "), "без отступов");
		assert.deepStrictEqual(JSON.parse(compact), { value });

		const huge = formatData({ value: Array.from({ length: 5_000 }, () => "y".repeat(40)) });
		assert.match(huge, /^\{"value":\["y+"/);
		assert.match(huge, /конец данных пропущен/);
	});
});

describe("clampOutput", () => {
	it("короткий вывод не меняется", () => {
		assert.strictEqual(clampOutput("две строки\nтекста"), "две строки\nтекста");
	});

	it("длинный вывод обрезается с начала, хвост сохраняется", () => {
		const text = `${"строка лога\n".repeat(4000)}последняя строка`;
		const clamped = clampOutput(text);

		assert.ok(clamped.length < text.length, "вывод должен стать короче");
		assert.ok(clamped.endsWith("последняя строка"), "хвост вывода сохраняется");
		assert.match(clamped, /^\[начало вывода пропущено: \d+ символов\]/);
	});

	it("длинный stdout в ответе инструмента обрезан", () => {
		const text = formatCommandResult({
			success: true,
			exitCode: 0,
			stdout: "x".repeat(50_000),
		});
		assert.ok(text.length < 20_000, `ожидался обрезанный вывод, длина ${text.length}`);
		assert.match(text, /начало вывода пропущено/);
	});
});

describe("isFailedResult", () => {
	it("неструктурированный результат не считается провалом", () => {
		assert.strictEqual(isFailedResult(null), false);
		assert.strictEqual(isFailedResult("готово"), false);
	});

	it("success: false — провал, success: true — нет", () => {
		assert.strictEqual(isFailedResult({ success: false, exitCode: 1 }), true);
		assert.strictEqual(isFailedResult({ success: true, exitCode: 0 }), false);
	});

	it("упавшие тесты — провал даже при нулевом коде возврата", () => {
		const result = {
			success: true,
			exitCode: 0,
			tests: {
				total: 3, passed: 1, failed: 2, errors: 0, skipped: 0,
				reportPath: "build/out/junit", failedTests: ["Тест"],
			},
		};
		assert.strictEqual(isFailedResult(result), true);
	});

	it("пустой отчёт — провал: тестов не было", () => {
		const result = {
			success: true,
			exitCode: 0,
			tests: {
				total: 0, passed: 0, failed: 0, errors: 0, skipped: 0,
				reportPath: "build/out/junit", failedTests: [],
			},
		};
		assert.strictEqual(isFailedResult(result), true);
	});
});
