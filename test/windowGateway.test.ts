/**
 * Тесты шлюза команд: два поддельных окна с каналами и записями в реестре,
 * вызовы доходят до нужного окна с его токеном.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ChannelError } from "../src/channelClient.js";
import { WindowGateway } from "../src/windowGateway.js";
import { registerWindow, startChannel, type ChannelRequest, type FakeChannel } from "./helpers/fakeWindow.js";

const WORK = path.resolve("/work");
const ERP = path.join(WORK, "erp");
const RETAIL = path.join(WORK, "retail");

/** Окно, которое на всё отвечает своим именем, а путь вне своей папки отклоняет. */
function windowReply(name: string, folder: string): (request: ChannelRequest) => { result: unknown } | { error: { message: string; code: string; details: unknown } } {
	return (request) => {
		if (request.method === "listCommands") {
			return { result: { descriptors: [{ id: `1c-platform-tools.${name}.cmd` }] } };
		}
		const projectPath = request.params?.projectPath;
		if (typeof projectPath === "string" && path.isAbsolute(projectPath) && !projectPath.startsWith(folder)) {
			return {
				error: {
					message: "Путь projectPath лежит вне папок рабочей области этого окна",
					code: "WORKSPACE_MISMATCH",
					details: { projectPath, workspaceRoots: [folder] },
				},
			};
		}
		return { result: { ok: true, commandResult: { window: name, projectPath } } };
	};
}

describe("WindowGateway", () => {
	let dir: string;
	let erp: FakeChannel;
	let retail: FakeChannel;

	before(async () => {
		dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-gateway-")), "windows");
		erp = await startChannel(windowReply("erp", ERP));
		retail = await startChannel(windowReply("retail", RETAIL));
		registerWindow(dir, { id: "erp", pipe: erp.pipe, folders: [ERP], app: "Visual Studio Code", updatedAt: "2026-10-28T09:00:00.000Z" });
		registerWindow(dir, { id: "retail", pipe: retail.pipe, folders: [RETAIL], app: "Cursor", updatedAt: "2026-10-28T10:00:00.000Z" });
	});

	after(async () => {
		await Promise.all([erp.close(), retail.close()]);
		fs.rmSync(path.dirname(dir), { recursive: true, force: true });
	});

	it("вызов агента из окна идёт в его окно с токеном этого окна", async () => {
		const gateway = new WindowGateway({ windowId: "retail" }, { registryDir: dir });

		const result = await gateway.executeCommand("1c-platform-tools.test.runAll", [{ wait: true }], undefined);

		assert.deepStrictEqual(result, { window: "retail" });
		assert.strictEqual(retail.requests.at(-1)?.token, "token-retail");
	});

	it("каталог запуска выбирает окно с этой папкой", async () => {
		const gateway = new WindowGateway({ cwd: ERP }, { registryDir: dir });
		assert.deepStrictEqual(await gateway.listCommandDescriptors(), [{ id: "1c-platform-tools.erp.cmd" }]);
		assert.deepStrictEqual(await gateway.executeCommand("cmd", [], undefined), { window: "erp" });
	});

	it("проект соседнего окна отклоняется, ответ называет окно с проектом", async () => {
		const gateway = new WindowGateway({ cwd: ERP }, { registryDir: dir });
		const before = retail.requests.length;

		await assert.rejects(
			() => gateway.executeCommand("cmd", [], RETAIL),
			(error: unknown) => {
				assert.ok(error instanceof ChannelError);
				assert.strictEqual(error.code, "WORKSPACE_MISMATCH");
				assert.ok(error.message.includes("retail"));
				return true;
			}
		);
		assert.strictEqual(retail.requests.length, before, "соседнее окно вызова не получает");
	});

	it("агент вне окон адресует окно путём проекта", async () => {
		const gateway = new WindowGateway({ cwd: path.resolve("/home/dev") }, { registryDir: dir });
		assert.deepStrictEqual(await gateway.executeCommand("cmd", [], path.join(RETAIL, "src")), {
			window: "retail",
			projectPath: path.join(RETAIL, "src"),
		});
		await assert.rejects(() => gateway.executeCommand("cmd", [], undefined), /PROJECT_PATH_REQUIRED/);
	});

	it("агент вне окон получает список команд из самого свежего окна", async () => {
		const gateway = new WindowGateway({ cwd: path.resolve("/home/dev") }, { registryDir: dir });
		assert.deepStrictEqual(await gateway.listCommandDescriptors(), [{ id: "1c-platform-tools.retail.cmd" }]);
	});

	it("агент из недоверенной папки не получает команды другого окна", async () => {
		const secret = path.resolve("/secret");
		registerWindow(dir, { id: "locked", pipe: "", token: "", folders: [secret], trusted: false });
		const gateway = new WindowGateway({ cwd: secret }, { registryDir: dir });
		const before = erp.requests.length + retail.requests.length;

		await assert.rejects(() => gateway.listCommandDescriptors(), (error: unknown) => {
			assert.ok(error instanceof ChannelError);
			assert.strictEqual(error.code, "WORKSPACE_NOT_TRUSTED");
			return true;
		});
		await assert.rejects(() => gateway.executeCommand("cmd", [], ERP), (error: unknown) => {
			assert.ok(error instanceof ChannelError);
			assert.strictEqual(error.code, "WORKSPACE_NOT_TRUSTED");
			return true;
		});
		assert.strictEqual(erp.requests.length + retail.requests.length, before);
	});

	it("без окон список команд отклоняется с понятной причиной", async () => {
		const gateway = new WindowGateway({ cwd: ERP }, { registryDir: path.join(dir, "пусто") });
		await assert.rejects(() => gateway.listCommandDescriptors(), /WINDOW_NOT_FOUND/);
	});
});
