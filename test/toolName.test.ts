/**
 * Тест: имена MCP-инструментов не превышают лимит 60 символов (сервер + имя).
 * См. .cursor/rules/naming-abbreviations.mdc
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
	commandIdToToolName,
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
			"1c-platform-tools.configuration.loadIncrementFromSrc",
			"1c-platform-tools.configuration.loadFromFilesByList",
			"1c-platform-tools.configuration.dumpIncrementToSrc",
			"1c-platform-tools.infobase.blockExternalResources",
			"1c-platform-tools.configuration.loadFromSrc",
			"1c-platform-tools.configuration.loadFromSrc.init",
			"1c-platform-tools.extensions.dumpToCfe",
			"1c-platform-tools.externalProcessors.decompile",
			"1c-platform-tools.externalReports.decompile",
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
		const withPrefix = commandIdToToolName("1c-platform-tools.configuration.loadFromSrc");
		const withoutPrefix = commandIdToToolName("configuration.loadFromSrc");
		assert.strictEqual(withPrefix, withoutPrefix);
		assert.strictEqual(withPrefix, "configuration_loadFromSrc");
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
