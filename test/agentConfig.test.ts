/**
 * Тесты конфига MCP в проекте для Cursor и Claude Code: запись, обновление
 * устаревшей записи и сохранение чужих серверов.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	writeAgentConfig,
	isStaleExtensionEntry,
	buildServerEntry,
	CLAUDE_CODE,
	CURSOR,
	SERVER_NAME,
} from "../src/agentConfig.js";

const EXT_DIR = "C:/Users/u/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.9-universal";
const SERVER_PATH = `${EXT_DIR}/out/src/index.js`;
const OLD_SERVER_PATH =
	"C:/Users/u/.cursor/extensions/yellow-hammer.mcp-1c-platform-tools-0.1.8-universal/out/src/index.js";

interface Entry {
	disabled?: boolean;
	args: string[];
	env: Record<string, string>;
}

function tempProject(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "agent-config-"));
}

function readServers(root: string, file: string): Record<string, Entry> {
	return JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).mcpServers;
}

function writeServers(root: string, file: string, servers: Record<string, unknown>): void {
	fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
	fs.writeFileSync(path.join(root, file), JSON.stringify({ mcpServers: servers }), "utf8");
}

describe("agentConfig", () => {
	it("Cursor: запись включает сервер, папки проекта в ней нет", async () => {
		const root = tempProject();
		const outcome = await writeAgentConfig(CURSOR, { serverPath: SERVER_PATH, workspace: root });

		assert.strictEqual(outcome, "created");
		const entry = readServers(root, path.join(".cursor", "mcp.json"))[SERVER_NAME];
		assert.strictEqual(entry.disabled, false);
		assert.deepStrictEqual(entry.args, [SERVER_PATH]);
		assert.strictEqual("env" in entry, false);
	});

	it("Claude Code: .mcp.json в корне папки, без поля disabled", async () => {
		const root = tempProject();
		const outcome = await writeAgentConfig(CLAUDE_CODE, { serverPath: SERVER_PATH, workspace: root });

		assert.strictEqual(outcome, "created");
		const entry = readServers(root, ".mcp.json")[SERVER_NAME];
		assert.strictEqual("disabled" in entry, false);
		assert.deepStrictEqual(entry.args, [SERVER_PATH]);
		assert.strictEqual("env" in entry, false);
	});

	it("обновляет запись прошлой версии: новый путь, без порта, настройки сервера сохраняются", async () => {
		const root = tempProject();
		const file = path.join(".cursor", "mcp.json");
		writeServers(root, file, {
			"other-server": { command: "node", args: ["other.js"] },
			[SERVER_NAME]: {
				disabled: false,
				command: "node",
				args: [OLD_SERVER_PATH],
				env: {
					ONEC_IPC_HOST: "127.0.0.1",
					ONEC_IPC_PORT: "40242",
					ONEC_IPC_TOKEN: "",
					MCP_1C_WAIT_TIMEOUT_MS: "3600000",
				},
			},
		});

		const outcome = await writeAgentConfig(CURSOR, { serverPath: SERVER_PATH, workspace: root }, true);

		assert.strictEqual(outcome, "updated");
		const servers = readServers(root, file);
		assert.deepStrictEqual(servers[SERVER_NAME].args, [SERVER_PATH]);
		assert.deepStrictEqual(servers[SERVER_NAME].env, {
			MCP_1C_WAIT_TIMEOUT_MS: "3600000",
		});
		assert.deepStrictEqual(servers["other-server"].args, ["other.js"], "чужой сервер сохранён");
	});

	it("не трогает запись с ручным путём", async () => {
		const root = tempProject();
		const manual = { [SERVER_NAME]: { command: "node", args: ["D:/dev/mcp/out/src/index.js"] } };
		writeServers(root, ".mcp.json", manual);

		const outcome = await writeAgentConfig(CLAUDE_CODE, { serverPath: SERVER_PATH, workspace: root }, true);

		assert.strictEqual(outcome, "unchanged");
		assert.deepStrictEqual(readServers(root, ".mcp.json"), manual);
	});

	it("не создаёт конфиг в режиме починки", async () => {
		const root = tempProject();
		for (const target of [CURSOR, CLAUDE_CODE]) {
			const outcome = await writeAgentConfig(target, { serverPath: SERVER_PATH, workspace: root }, true);
			assert.strictEqual(outcome, "unchanged");
			assert.strictEqual(fs.existsSync(path.join(root, target.file)), false);
		}
	});

	it("isStaleExtensionEntry: запись этого расширения с другой установкой", () => {
		const config = { serverPath: SERVER_PATH, workspace: "C:/work/erp" };
		const actual = buildServerEntry(CURSOR, config);
		const otherInstall = buildServerEntry(CURSOR, { ...config, serverPath: OLD_SERVER_PATH });
		const foreign = { command: "node", args: ["D:/dev/mcp/out/src/index.js"] };

		assert.strictEqual(isStaleExtensionEntry(actual, config), false);
		assert.strictEqual(isStaleExtensionEntry(otherInstall, config), true);
		assert.strictEqual(isStaleExtensionEntry(foreign, config), false);
		assert.strictEqual(isStaleExtensionEntry(undefined, config), false);
	});
});
