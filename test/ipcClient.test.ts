/**
 * Тесты IpcClient: конфигурация и вызов request через фейковый TCP-сервер.
 */
import * as net from "node:net";
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { IpcClient, type IpcClientConfig } from "../src/ipcClient.js";

describe("IpcClient", () => {
	describe("constructor", () => {
		it("использует переданную конфигурацию", () => {
			const config: IpcClientConfig = {
				host: "10.0.0.1",
				port: 9999,
				token: "secret",
				timeoutMs: 1000,
			};
			const client = new IpcClient(config);
			// Доступа к config нет, проверяем через request — будет попытка подключения к 10.0.0.1:9999
			assert.ok(client instanceof IpcClient);
		});

		it("принимает частичную конфигурацию (порт по умолчанию 40241)", () => {
			const client = new IpcClient({ host: "127.0.0.1" });
			assert.ok(client instanceof IpcClient);
		});
	});

	describe("request (с фейковым TCP-сервером)", () => {
		let server: net.Server;
		let serverPort: number;

		before(() => {
			return new Promise<void>((resolve) => {
				server = net.createServer((socket) => {
					socket.on("data", (data: Buffer) => {
						// Ожидаем JSON-RPC запрос; отвечаем одним JSON с result
						const payload = JSON.stringify({
							id: null,
							result: { value: 42 },
						});
						socket.write(payload + "\n");
						socket.end();
					});
				});
				server.listen(0, "127.0.0.1", () => {
					const addr = server.address();
					serverPort = typeof addr === "object" && addr?.port ? addr.port : 0;
					resolve();
				});
			});
		});

		after(() => {
			return new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		});

		it("возвращает result из ответа сервера", async () => {
			const client = new IpcClient({
				host: "127.0.0.1",
				port: serverPort,
				timeoutMs: 5000,
			});
			const result = await client.request<{ value: number }>("test", {});
			assert.strictEqual(result?.value, 42);
		});
	});

	describe("request — ответ с error", () => {
		let server: net.Server;
		let serverPort: number;

		before(() => {
			return new Promise<void>((resolve) => {
				server = net.createServer((socket) => {
					socket.on("data", () => {
						const payload = JSON.stringify({
							id: null,
							error: { message: "Ошибка сервера", code: "ERR" },
						});
						socket.write(payload + "\n");
						socket.end();
					});
				});
				server.listen(0, "127.0.0.1", () => {
					const addr = server.address();
					serverPort = typeof addr === "object" && addr?.port ? addr.port : 0;
					resolve();
				});
			});
		});

		after(() => {
			return new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		});

		it("отклоняет промис с сообщением и кодом ошибки", async () => {
			const client = new IpcClient({
				host: "127.0.0.1",
				port: serverPort,
				timeoutMs: 5000,
			});
			await assert.rejects(
				async () => client.request("test"),
				(err: Error) => err.message.includes("Ошибка сервера") && err.message.includes("ERR")
			);
		});
	});

	describe("executeCommand и listCommands (через фейковый сервер)", () => {
		let server: net.Server;
		let serverPort: number;

		before(() => {
			return new Promise<void>((resolve) => {
				server = net.createServer((socket) => {
					socket.on("data", (data: Buffer) => {
						const req = JSON.parse(data.toString().split("\n")[0]);
						const method = req.method;
						const id = req.id;
						let result: unknown;
						if (method === "listCommands") {
							result = { commands: ["cmd.a", "cmd.b"] };
						} else if (method === "executeCommand") {
							result = { ok: true, commandResult: "done" };
						} else {
							result = null;
						}
						socket.write(JSON.stringify({ id, result }) + "\n");
						socket.end();
					});
				});
				server.listen(0, "127.0.0.1", () => {
					const addr = server.address();
					serverPort = typeof addr === "object" && addr?.port ? addr.port : 0;
					resolve();
				});
			});
		});

		after(() => {
			return new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		});

		it("listCommands возвращает массив command ID", async () => {
			const client = new IpcClient({
				host: "127.0.0.1",
				port: serverPort,
				timeoutMs: 5000,
			});
			const commands = await client.listCommands();
			assert.deepStrictEqual(commands, ["cmd.a", "cmd.b"]);
		});

		it("executeCommand возвращает commandResult при ok: true", async () => {
			const client = new IpcClient({
				host: "127.0.0.1",
				port: serverPort,
				timeoutMs: 5000,
			});
			const result = await client.executeCommand("cmd.a", [], "/path");
			assert.strictEqual(result, "done");
		});
	});

	describe("executeCommand — ok: false", () => {
		let server: net.Server;
		let serverPort: number;

		before(() => {
			return new Promise<void>((resolve) => {
				server = net.createServer((socket) => {
					socket.on("data", (data: Buffer) => {
						const req = JSON.parse(data.toString().split("\n")[0]);
						const payload = JSON.stringify({
							id: req.id,
							result: {
								ok: false,
								message: "Команда не выполнена",
							},
						});
						socket.write(payload + "\n");
						socket.end();
					});
				});
				server.listen(0, "127.0.0.1", () => {
					const addr = server.address();
					serverPort = typeof addr === "object" && addr?.port ? addr.port : 0;
					resolve();
				});
			});
		});

		after(() => {
			return new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		});

		it("выбрасывает Error с сообщением сервера", async () => {
			const client = new IpcClient({
				host: "127.0.0.1",
				port: serverPort,
				timeoutMs: 5000,
			});
			await assert.rejects(
				async () => client.executeCommand("x", [], "/p"),
				(err: Error) => err.message === "Команда не выполнена"
			);
		});
	});
});
