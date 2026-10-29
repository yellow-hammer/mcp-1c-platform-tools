/**
 * Сквозной тест: собранный сервер запускается так, как его запускает клиент
 * из конфига (Cursor, Claude Code), находит окно в реестре и выполняет
 * команду в нём. Реестр лежит во временном домашнем каталоге.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { windowRegistryDir } from "../src/windowRegistry.js";
import { registerWindow, startChannel, type FakeChannel } from "./helpers/fakeWindow.js";

const SERVER = fileURLToPath(new URL("../src/index.js", import.meta.url));

/**
 * Запускает сервер с домашним каталогом и папкой агента.
 *
 * @param home — домашний каталог с реестром окон
 * @param folder — каталог, из которого запускается сервер
 * @returns подключённый клиент MCP
 */
async function startServer(home: string, folder: string): Promise<Client> {
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [SERVER],
		cwd: folder,
		env: { HOME: home, USERPROFILE: home, MCP_1C_LOG_LEVEL: "error", MCP_1C_WINDOW_WAIT_MS: "0" },
		stderr: "ignore",
	});
	const client = new Client({ name: "test", version: "1" });
	await client.connect(transport);
	return client;
}

describe("сервер из конфига клиента", () => {
	let home: string;
	let project: string;
	let channel: FakeChannel;

	before(async () => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-home-"));
		project = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-project-"));
		channel = await startChannel((request) =>
			request.method === "listCommands"
				? { result: { descriptors: [{ id: "1c-platform-tools.env.status", title: "Состояние окружения", supportsWait: true }] } }
				: { result: { ok: true, commandResult: { success: true, exitCode: 0, stdout: "профиль dev", stderr: "" } } }
		);
	});

	after(async () => {
		await channel.close();
		fs.rmSync(home, { recursive: true, force: true });
		fs.rmSync(project, { recursive: true, force: true });
	});

	it("без окна с проектом вместо инструментов заглушка с причиной", async () => {
		const client = await startServer(home, project);
		try {
			const { tools } = await client.listTools();
			assert.deepStrictEqual(tools.map((tool) => tool.name), ["onec_platform_tools_status"]);

			const answer = await client.callTool({ name: "onec_platform_tools_status", arguments: {} });
			assert.strictEqual(answer.isError, true);
			assert.match(JSON.stringify(answer.content), /WINDOW_NOT_FOUND/);
		} finally {
			await client.close();
		}
	});

	it("находит окно по каталогу запуска и выполняет команду в нём", async () => {
		registerWindow(windowRegistryDir(home), { id: "erp", pipe: channel.pipe, folders: [project] });
		const client = await startServer(home, project);
		try {
			const { tools } = await client.listTools();
			assert.deepStrictEqual(tools.map((tool) => tool.name).sort(), ["env_status", "onec_platform_tools_status"]);

			const answer = await client.callTool({ name: "env_status", arguments: {} });
			assert.notStrictEqual(answer.isError, true);
			assert.match(JSON.stringify(answer.content), /профиль dev/);

			const call = channel.requests.find((request) => request.method === "executeCommand");
			assert.strictEqual(call?.token, "token-erp");
			assert.strictEqual(call?.params?.commandId, "1c-platform-tools.env.status");
		} finally {
			await client.close();
		}
	});
});
