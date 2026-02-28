/**
 * Тесты formatCommandResult: преобразование результата команды в строку ответа инструмента.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatCommandResult } from "../src/formatCommandResult.js";

describe("formatCommandResult", () => {
	it("возвращает 'Выполнено.' для null и undefined", () => {
		assert.strictEqual(formatCommandResult(null), "Выполнено.");
		assert.strictEqual(formatCommandResult(undefined), "Выполнено.");
	});

	it("возвращает 'Выполнено.' для пустой строки, иначе 'Выполнено. ' + строка", () => {
		assert.strictEqual(formatCommandResult(""), "Выполнено.");
		assert.strictEqual(formatCommandResult("   "), "Выполнено.");
		assert.strictEqual(formatCommandResult("ok"), "Выполнено. ok");
		assert.strictEqual(formatCommandResult("  msg  "), "Выполнено.   msg  ");
	});

	it("для объекта приоритет: stdout → stderr → message", () => {
		assert.strictEqual(
			formatCommandResult({ stdout: "out" }),
			"Выполнено. stdout: out"
		);
		assert.strictEqual(
			formatCommandResult({ stderr: "err" }),
			"Выполнено. stderr: err"
		);
		assert.strictEqual(
			formatCommandResult({ message: "msg" }),
			"Выполнено. msg"
		);
		assert.strictEqual(
			formatCommandResult({ stdout: "a", stderr: "b", message: "c" }),
			"Выполнено. stdout: a"
		);
		assert.strictEqual(
			formatCommandResult({ stderr: "b", message: "c" }),
			"Выполнено. stderr: b"
		);
	});

	it("игнорирует пустые stdout/stderr/message", () => {
		assert.strictEqual(formatCommandResult({ stdout: "" }), "Выполнено.");
		assert.strictEqual(formatCommandResult({ stdout: "   " }), "Выполнено.");
		assert.strictEqual(formatCommandResult({ stderr: "" }), "Выполнено.");
		assert.strictEqual(formatCommandResult({ message: "" }), "Выполнено.");
	});

	it("возвращает 'Выполнено.' для объекта без stdout/stderr/message и для примитивов", () => {
		assert.strictEqual(formatCommandResult({}), "Выполнено.");
		assert.strictEqual(formatCommandResult({ foo: "bar" }), "Выполнено.");
		assert.strictEqual(formatCommandResult(42), "Выполнено.");
		assert.strictEqual(formatCommandResult(true), "Выполнено.");
	});
});
