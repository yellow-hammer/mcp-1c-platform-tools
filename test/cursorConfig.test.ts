/**
 * Тесты конфига MCP для Cursor: запись, обновление устаревшего пути и
 * сохранение чужих серверов.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	writeCursorConfig,
	isStaleExtensionEntry,
	buildServerEntry,
	SERVER_NAME,
} from "../src/cursorConfig.js";

const EXT_DIR = "C:/Users/u/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.9-universal";
const SERVER_PATH = `${EXT_DIR}/out/src/index.js`;
const OLD_SERVER_PATH =
	"C:/Users/u/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.8-universal/out/src/index.js";

function tempProject(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "cursor-config-"));
}

function readConfig(root: string): Record<string, unknown> {
	return JSON.parse(fs.readFileSync(path.join(root, ".cursor", "mcp.json"), "utf8"));
}

describe("cursorConfig", () => {
	it("создаёт конфиг с путём к серверу и параметрами IPC", async () => {
		const root = tempProject();
		const outcome = await writeCursorConfig(root, { serverPath: SERVER_PATH, port: 40245, token: "" });

		assert.strictEqual(outcome, "created");
		const servers = readConfig(root).mcpServers as Record<string, { args: string[]; env: Record<string, string> }>;
		assert.deepStrictEqual(servers[SERVER_NAME].args, [SERVER_PATH]);
		assert.strictEqual(servers[SERVER_NAME].env.ONEC_IPC_PORT, "40245");
	});

	it("обновляет устаревший путь и сохраняет чужие серверы", async () => {
		const root = tempProject();
		fs.mkdirSync(path.join(root, ".cursor"));
		fs.writeFileSync(
			path.join(root, ".cursor", "mcp.json"),
			JSON.stringify({
				mcpServers: {
					"other-server": { command: "node", args: ["other.js"] },
					[SERVER_NAME]: buildServerEntry({ serverPath: OLD_SERVER_PATH, port: 40241, token: "" }),
				},
			}),
			"utf8"
		);

		const outcome = await writeCursorConfig(root, { serverPath: SERVER_PATH, port: 40241, token: "" }, true);

		assert.strictEqual(outcome, "updated");
		const servers = readConfig(root).mcpServers as Record<string, { args: string[] }>;
		assert.deepStrictEqual(servers[SERVER_NAME].args, [SERVER_PATH]);
		assert.deepStrictEqual(servers["other-server"].args, ["other.js"], "чужой сервер сохранён");
	});

	it("не трогает конфиг с ручным путём", async () => {
		const root = tempProject();
		fs.mkdirSync(path.join(root, ".cursor"));
		const manual = {
			mcpServers: {
				[SERVER_NAME]: { command: "node", args: ["D:/dev/mcp/out/src/index.js"] },
			},
		};
		fs.writeFileSync(path.join(root, ".cursor", "mcp.json"), JSON.stringify(manual), "utf8");

		const outcome = await writeCursorConfig(root, { serverPath: SERVER_PATH, port: 40241, token: "" }, true);

		assert.strictEqual(outcome, "unchanged");
		assert.deepStrictEqual(readConfig(root), manual);
	});

	it("не создаёт конфиг в режиме починки", async () => {
		const root = tempProject();
		const outcome = await writeCursorConfig(root, { serverPath: SERVER_PATH, port: 40241, token: "" }, true);

		assert.strictEqual(outcome, "unchanged");
		assert.strictEqual(fs.existsSync(path.join(root, ".cursor", "mcp.json")), false);
	});

	it("isStaleExtensionEntry: только другая установка этого расширения", () => {
		const stale = buildServerEntry({ serverPath: OLD_SERVER_PATH, port: 40241, token: "" });
		const actual = buildServerEntry({ serverPath: SERVER_PATH, port: 40241, token: "" });
		const foreign = { command: "node", args: ["D:/dev/mcp/out/src/index.js"] };

		assert.strictEqual(isStaleExtensionEntry(stale, SERVER_PATH), true);
		assert.strictEqual(isStaleExtensionEntry(actual, SERVER_PATH), false);
		assert.strictEqual(isStaleExtensionEntry(foreign, SERVER_PATH), false);
		assert.strictEqual(isStaleExtensionEntry(undefined, SERVER_PATH), false);
	});
});
