/**
 * Тесты чтения реестра окон: формат записи 1C: Platform Tools, открытые и
 * закрытые окна, окна другой версии.
 */
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readWindowRegistry, windowRegistryDir } from "../src/windowRegistry.js";
import { channelPath, fixturePath, registerWindow } from "./helpers/fakeWindow.js";

let dir: string;
const cleanup: string[] = [];

/** Путь канала, у которого есть файл сокета: так выглядит слушающее окно. */
function livePipe(): string {
	const { pipe, dir: socketDir } = channelPath();
	if (socketDir) {
		cleanup.push(socketDir);
		fs.writeFileSync(pipe, "");
	}
	return pipe;
}

beforeEach(() => {
	dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-registry-")), "windows");
	fs.mkdirSync(dir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(path.dirname(dir), { recursive: true, force: true });
	for (const socketDir of cleanup.splice(0)) {
		fs.rmSync(socketDir, { recursive: true, force: true });
	}
});

describe("readWindowRegistry", () => {
	it("читает запись в формате 1C: Platform Tools", async () => {
		const record = JSON.parse(fs.readFileSync(fixturePath("window-record.json"), "utf8"));
		fs.writeFileSync(path.join(dir, `${record.id}.json`), JSON.stringify({ ...record, pipe: livePipe() }));

		const { windows, otherVersions } = await readWindowRegistry(dir, (pid) => pid === record.pid);

		assert.strictEqual(otherVersions, 0);
		assert.strictEqual(windows.length, 1);
		assert.deepStrictEqual(windows[0].folders, ["/home/dev/erp", "/home/dev/retail"]);
		assert.strictEqual(windows[0].currentProject, "/home/dev/erp");
		assert.strictEqual(windows[0].token, record.token);
	});

	it("окно с завершённым процессом не берётся", async () => {
		registerWindow(dir, { id: "live", pipe: livePipe(), folders: ["/work/erp"], pid: 1 });
		registerWindow(dir, { id: "dead", pipe: livePipe(), folders: ["/work/retail"], pid: 2 });

		const { windows } = await readWindowRegistry(dir, (pid) => pid === 1);

		assert.deepStrictEqual(windows.map((window) => window.id), ["live"]);
	});

	it("недоверенное окно берётся без канала", async () => {
		registerWindow(dir, { id: "locked", pipe: "", token: "", folders: ["/secret"], trusted: false });

		const { windows } = await readWindowRegistry(dir);

		assert.deepStrictEqual(
			windows.map((window) => window.id),
			["locked"]
		);
		assert.strictEqual(windows[0]?.trusted, false);
	});

	it("окно без сокета не берётся", { skip: process.platform === "win32" }, async () => {
		registerWindow(dir, { id: "gone", pipe: path.join(os.tmpdir(), "mcp-1cpt-нет", "channel.sock"), folders: ["/work/erp"] });

		assert.deepStrictEqual((await readWindowRegistry(dir)).windows, []);
	});

	it("окно другой версии считается отдельно, повреждённые записи пропускаются", async () => {
		const record = JSON.parse(fs.readFileSync(fixturePath("window-record.json"), "utf8"));
		fs.writeFileSync(path.join(dir, "next.json"), JSON.stringify({ ...record, version: 2, pid: process.pid }));
		fs.writeFileSync(path.join(dir, "broken.json"), "{ \"version\": 1,");
		fs.writeFileSync(path.join(dir, "no-token.json"), JSON.stringify({ ...record, token: undefined, pid: process.pid }));

		const snapshot = await readWindowRegistry(dir);

		assert.deepStrictEqual(snapshot, { windows: [], otherVersions: 1 });
	});

	it("без каталога реестра окон нет", async () => {
		assert.deepStrictEqual(await readWindowRegistry(path.join(dir, "нет")), { windows: [], otherVersions: 0 });
	});

	it("каталог реестра совпадает с каталогом 1C: Platform Tools", () => {
		assert.strictEqual(windowRegistryDir(path.join("/home", "dev")), path.join("/home", "dev", ".1c-platform-tools", "windows"));
	});
});
