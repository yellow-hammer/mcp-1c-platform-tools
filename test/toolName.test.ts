/**
 * Тест: имена MCP-инструментов не превышают лимит 60 символов (сервер + имя).
 * См. .cursor/rules/naming-abbreviations.mdc
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
	commandIdToToolName,
	describeCommand,
	uniqueToolName,
	getCombinedLength,
	MAX_COMBINED_LENGTH,
	MCP_SERVER_NAME,
} from "../src/toolName.js";

describe("toolName", () => {
	it("combined server and tool name length must not exceed 60 characters", () => {
		const commandIds = [
			"1c-platform-tools.dependencies.initializeProjectStructure",
			"1c-platform-tools.artifacts.decompileConfiguration_fromEditor",
			"1c-platform-tools.artifacts.decompileExtension_fromEditor",
			"1c-platform-tools.artifacts.decompileProcessor_fromEditor",
			"1c-platform-tools.cf.loadIncrement",
			"1c-platform-tools.cf.loadByList",
			"1c-platform-tools.cf.dumpIncrement",
			"1c-platform-tools.infobase.blockExternalResources",
			"1c-platform-tools.cf.load",
			"1c-platform-tools.infobase.initFromSrc",
			"1c-platform-tools.cfe.unload",
			"1c-platform-tools.epf.decompileProcessor",
			"1c-platform-tools.epf.decompileReport",
		];

		for (const commandId of commandIds) {
			const toolName = commandIdToToolName(commandId);
			const combinedLength = getCombinedLength(toolName);
			assert.ok(
				combinedLength <= MAX_COMBINED_LENGTH,
				`commandId "${commandId}" -> toolName "${toolName}": combined length ${combinedLength} exceeds ${MAX_COMBINED_LENGTH}`
			);
		}
	});

	it("getCombinedLength возвращает длину 'сервер: инструмент'", () => {
		assert.strictEqual(getCombinedLength(""), MCP_SERVER_NAME.length + 2);
		assert.strictEqual(getCombinedLength("x"), MCP_SERVER_NAME.length + 2 + 1);
		assert.strictEqual(
			getCombinedLength("configuration_loadFromSrc"),
			MCP_SERVER_NAME.length + 2 + "configuration_loadFromSrc".length
		);
	});

	it("commandId без префикса даёт тот же результат, что и с префиксом (префикс отрезается)", () => {
		const withPrefix = commandIdToToolName("1c-platform-tools.cf.load");
		const withoutPrefix = commandIdToToolName("cf.load");
		assert.strictEqual(withPrefix, withoutPrefix);
		assert.strictEqual(withPrefix, "cf_load");
	});

	it("применяет аббревиатуры и заменяет точки на подчёркивания", () => {
		assert.strictEqual(
			commandIdToToolName("1c-platform-tools.dependencies.initializeProjectStructure"),
			"deps_initProjStruct"
		);
		// Configuration (с заглавной) → Cfg; без префикса остаётся configuration
		assert.strictEqual(
			commandIdToToolName("1c-platform-tools.Configuration.loadFromSrc"),
			"Cfg_loadFromSrc"
		);
	});
});

describe("describeCommand", () => {
	it("заголовок и категория попадают в описание", () => {
		const text = describeCommand({
			id: "1c-platform-tools.test.runAll",
			title: "Запустить все тесты",
			category: "1C: Тестирование",
		});
		assert.match(text, /1C: Тестирование: Запустить все тесты/);
		assert.match(text, /1c-platform-tools\.test\.runAll/);
	});

	it("без категории описание остаётся осмысленным", () => {
		const text = describeCommand({ id: "1c-platform-tools.env.status", title: "Состояние окружения" });
		assert.match(text, /^Состояние окружения\./);
	});

	it("без заголовка описание строится из идентификатора", () => {
		const text = describeCommand({ id: "1c-platform-tools.env.status" });
		assert.match(text, /1c-platform-tools\.env\.status/);
	});
});

describe("describeCommand: команды интерфейса", () => {
	it("команда без синхронного режима помечается в описании", () => {
		const text = describeCommand({
			id: "1c-platform-tools.run.designer",
			title: "Запустить Конфигуратор",
			supportsWait: false,
		});
		assert.match(text, /Исход операции не возвращается/);
	});

	it("обычная команда пометки не получает", () => {
		const text = describeCommand({
			id: "1c-platform-tools.test.runXUnit",
			title: "Запустить тесты xUnit",
			supportsWait: true,
		});
		assert.doesNotMatch(text, /Исход операции не возвращается/);
	});
});

describe("uniqueToolName", () => {
	it("свободное имя отдаётся как есть", () => {
		const used = new Set<string>();
		assert.strictEqual(
			uniqueToolName("1c-platform-tools.test.runXUnit", used),
			commandIdToToolName("1c-platform-tools.test.runXUnit")
		);
	});

	it("занятое имя получает суффикс и не повторяется", () => {
		const used = new Set<string>();
		const first = uniqueToolName("1c-platform-tools.test.runXUnit", used);
		const second = uniqueToolName("1c-platform-tools.test.runXUnit", used);
		const third = uniqueToolName("1c-platform-tools.test.runXUnit", used);

		assert.notStrictEqual(second, first);
		assert.notStrictEqual(third, second);
		assert.strictEqual(used.size, 3);
	});

	it("запасное имя укладывается в лимит длины", () => {
		const used = new Set<string>();
		const longId = "1c-platform-tools.cf.loadIncrementWithVeryLongTail";
		uniqueToolName(longId, used);
		const fallback = uniqueToolName(longId, used);
		assert.ok(
			getCombinedLength(fallback) <= MAX_COMBINED_LENGTH,
			`длина ${getCombinedLength(fallback)} превышает лимит`
		);
	});
});
