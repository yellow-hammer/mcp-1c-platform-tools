/**
 * Тесты проверки API 1C: Platform Tools, через которое провайдер VS Code узнаёт окно.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { hasMcpWindow } from "../src/platformToolsApi.js";

describe("hasMcpWindow", () => {
	it("распознаёт API с окном для MCP-сервера", () => {
		assert.strictEqual(hasMcpWindow({ getMcpWindow: async () => "abc" }), true);
	});

	it("прошлые версии 1C: Platform Tools окна не дают", () => {
		assert.strictEqual(hasMcpWindow(undefined), false);
		assert.strictEqual(hasMcpWindow(null), false);
		assert.strictEqual(hasMcpWindow({}), false);
		assert.strictEqual(hasMcpWindow({ getMcpChannel: async () => undefined }), false);
		assert.strictEqual(hasMcpWindow({ getMcpWindow: "нет" }), false);
	});
});
