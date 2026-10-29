/**
 * Поддельное окно 1C: Platform Tools для тестов: канал окна (Unix-сокет или
 * именованный канал Windows) и запись окна в реестре.
 */
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { RegisteredWindow } from "../../src/windowRegistry.js";

/** Запрос, который получил канал. */
export interface ChannelRequest {
	id: string;
	method: string;
	params?: Record<string, unknown>;
	token?: string;
}

/** Ответ канала на запрос. */
export type ChannelReply = { result: unknown } | { error: { message: string; code?: string; details?: unknown } };

/** Поднятый канал окна. */
export interface FakeChannel {
	pipe: string;
	/** Запросы в порядке поступления. */
	requests: ChannelRequest[];
	close(): Promise<void>;
}

/**
 * Путь канала, как его заводит расширение.
 *
 * @returns путь канала и временный каталог сокета
 */
export function channelPath(): { pipe: string; dir?: string } {
	const id = randomBytes(8).toString("hex");
	if (process.platform === "win32") {
		return { pipe: `\\\\.\\pipe\\mcp-1cpt-test-${id}` };
	}
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-1cpt-"));
	return { pipe: path.join(dir, "channel.sock"), dir };
}

/**
 * Поднимает канал, который отвечает на каждую строку запроса.
 *
 * @param reply — ответ на запрос
 * @returns канал
 */
export async function startChannel(reply: (request: ChannelRequest) => ChannelReply): Promise<FakeChannel> {
	const { pipe, dir } = channelPath();
	const requests: ChannelRequest[] = [];
	const server = net.createServer((socket) => {
		let buffer = "";
		socket.setEncoding("utf8");
		socket.on("error", () => undefined);
		socket.on("data", (chunk: string) => {
			buffer += chunk;
			let end = buffer.indexOf("\n");
			while (end !== -1) {
				const request = JSON.parse(buffer.slice(0, end)) as ChannelRequest;
				buffer = buffer.slice(end + 1);
				requests.push(request);
				socket.write(`${JSON.stringify({ id: request.id, ...reply(request) })}\n`);
				end = buffer.indexOf("\n");
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(pipe, () => resolve());
	});
	return {
		pipe,
		requests,
		close: () =>
			new Promise<void>((resolve) =>
				server.close(() => {
					if (dir) {
						fs.rmSync(dir, { recursive: true, force: true });
					}
					resolve();
				})
			),
	};
}

/**
 * Пишет окно в каталог реестра так, как это делает 1C: Platform Tools.
 *
 * @param dir — каталог реестра
 * @param window — поля окна; процесс по умолчанию — процесс теста
 * @returns записанное окно
 */
export function registerWindow(
	dir: string,
	window: Pick<RegisteredWindow, "id" | "pipe" | "folders"> & Partial<RegisteredWindow>
): RegisteredWindow {
	const record = {
		version: 1,
		pid: process.pid,
		hostname: os.hostname(),
		app: "Visual Studio Code",
		name: path.basename(window.folders[0] ?? window.id),
		token: `token-${window.id}`,
		trusted: true,
		projects: window.folders,
		currentProject: window.folders[0],
		updatedAt: new Date().toISOString(),
		...window,
	};
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `${window.id}.json`), JSON.stringify(record), "utf8");
	return record;
}

/**
 * Путь к фикстуре теста.
 *
 * @param name — имя файла в test/fixtures
 * @returns абсолютный путь
 */
export function fixturePath(name: string): string {
	// Тесты запускаются из out/test, фикстуры лежат в исходном test/fixtures
	return fileURLToPath(new URL(`../../../test/fixtures/${name}`, import.meta.url));
}
