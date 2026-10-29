/**
 * Тесты ChannelClient: вызовы по каналу окна (Unix-сокет или именованный канал Windows).
 */
import * as fs from "node:fs";
import * as net from "node:net";
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { ChannelClient, ChannelError } from "../src/channelClient.js";
import { channelPath, startChannel, type FakeChannel } from "./helpers/fakeWindow.js";

describe("ChannelClient: запросы по каналу окна", () => {
	let channel: FakeChannel;

	before(async () => {
		channel = await startChannel((request) => {
			if (request.method === "executeCommand") {
				return request.params?.commandId === "cmd.fail"
					? { result: { ok: false, message: "Команда не выполнена" } }
					: { result: { ok: true, commandResult: "done" } };
			}
			return { result: { value: 42 } };
		});
	});

	after(() => channel.close());

	it("возвращает result из ответа и передаёт токен канала", async () => {
		const client = new ChannelClient({ pipe: channel.pipe, token: "сессия", timeoutMs: 5000 });
		const result = await client.request<{ value: number }>("test", {});
		assert.strictEqual(result?.value, 42);
		assert.strictEqual(channel.requests.at(-1)?.token, "сессия");
	});

	it("executeCommand передаёт команду и путь проекта и возвращает commandResult", async () => {
		const client = new ChannelClient({ pipe: channel.pipe, token: "t", timeoutMs: 5000 });
		// Увеличенный таймаут для wait-сценария — команда должна выполниться штатно
		const result = await client.executeCommand("cmd.a", [{ wait: true }], "/path", 300_000);
		assert.strictEqual(result, "done");
		assert.deepStrictEqual(channel.requests.at(-1)?.params, { commandId: "cmd.a", args: [{ wait: true }], projectPath: "/path" });
	});

	it("executeCommand при ok: false выбрасывает Error с сообщением расширения", async () => {
		const client = new ChannelClient({ pipe: channel.pipe, token: "t", timeoutMs: 5000 });
		await assert.rejects(
			async () => client.executeCommand("cmd.fail", [], "/p"),
			(err: Error) => err.message === "Команда не выполнена"
		);
	});
});

describe("ChannelClient: отказ расширения", () => {
	let channel: FakeChannel;

	before(async () => {
		channel = await startChannel(() => ({
			error: {
				message: "Путь projectPath лежит вне папок рабочей области этого окна",
				code: "WORKSPACE_MISMATCH",
				details: { projectPath: "C:/wrong", workspaceRoots: ["C:/work/erp"] },
			},
		}));
	});

	after(() => channel.close());

	it("сообщение, код и подробности попадают в ошибку", async () => {
		const client = new ChannelClient({ pipe: channel.pipe, token: "t", timeoutMs: 2000 });
		await assert.rejects(
			() => client.request("executeCommand"),
			(error: unknown) => {
				assert.ok(error instanceof ChannelError);
				assert.strictEqual(error.code, "WORKSPACE_MISMATCH");
				assert.strictEqual(error.reason, "Путь projectPath лежит вне папок рабочей области этого окна");
				assert.match(error.message, /C:\/work\/erp/);
				return true;
			}
		);
	});
});

describe("ChannelClient: кириллица на стыке порций", () => {
	const name = "РегистрСведений.ДополнительныеАдресныеСведения";
	let server: net.Server;
	let pipe: string;
	let dir: string | undefined;

	before(() => {
		({ pipe, dir } = channelPath());
		server = net.createServer((socket) => {
			socket.on("data", () => {
				const bytes = Buffer.from(`${JSON.stringify({ id: null, result: { name } })}\n`, "utf8");
				// Рвём ответ посреди двухбайтовой буквы: так его бывает режет сокет
				const cut = bytes.indexOf(Buffer.from("н", "utf8")) + 1;
				socket.write(bytes.subarray(0, cut));
				setTimeout(() => {
					socket.write(bytes.subarray(cut));
					socket.end();
				}, 20);
			});
		});
		return new Promise<void>((resolve) => server.listen(pipe, () => resolve()));
	});

	after(() => {
		return new Promise<void>((resolve) =>
			server.close(() => {
				if (dir) {
					fs.rmSync(dir, { recursive: true, force: true });
				}
				resolve();
			})
		);
	});

	it("буква, разорванная между порциями, не портится", async () => {
		const client = new ChannelClient({ pipe, token: "t", timeoutMs: 5000 });
		const result = await client.request<{ name: string }>("test", {});
		assert.strictEqual(result?.name, name);
	});
});

describe("ChannelClient: окно не слушает", () => {
	it("ошибка подключения говорит, что окно недоступно", async () => {
		const { pipe, dir } = channelPath();
		try {
			const client = new ChannelClient({ pipe, token: "t", timeoutMs: 2000 });
			await assert.rejects(() => client.request("ping"), /Не удалось подключиться к окну 1C: Platform Tools/);
		} finally {
			if (dir) {
				fs.rmSync(dir, { recursive: true, force: true });
			}
		}
	});
});
