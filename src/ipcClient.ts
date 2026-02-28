/**
 * TCP-клиент к IPC-серверу расширения 1c-platform-tools (JSON-RPC over newline-delimited JSON).
 * Используется standalone MCP-процессом для listCommands и executeCommand.
 */
import * as net from "node:net";
import { randomUUID } from "node:crypto";
import { logger } from "./loggerServer.js";

/** Настройки подключения к IPC-серверу (хост, порт, токен, таймаут). */
export interface IpcClientConfig {
	host: string;
	port: number;
	token: string | null;
	timeoutMs: number;
}

/** Тело запроса к IPC-серверу. */
interface IpcRequestPayload {
	id: string;
	method: string;
	params?: Record<string, unknown>;
	token?: string;
}

/** Тело ответа IPC-сервера (result или error). */
interface IpcResponsePayload {
	id: string | null;
	result?: unknown;
	error?: {
		message: string;
		code?: string;
		details?: unknown;
	};
}

/**
 * Клиент для вызова методов расширения 1c-platform-tools по TCP (IPC).
 * Параметры по умолчанию берутся из env: ONEC_IPC_HOST, ONEC_IPC_PORT, ONEC_IPC_TOKEN.
 */
export class IpcClient {
	private readonly config: IpcClientConfig;

	/**
	 * Создаёт клиент с переданной конфигурацией или значениями из переменных окружения.
	 *
	 * @param config — частичная конфигурация (хост, порт, токен, timeoutMs)
	 */
	constructor(config?: Partial<IpcClientConfig>) {
		const portEnv = Number.parseInt(process.env.ONEC_IPC_PORT ?? "", 10);
		let port: number;
		const configPort = config?.port;
		if (Number.isFinite(configPort) && (configPort ?? 0) > 0) {
			port = configPort as number;
		} else if (Number.isFinite(portEnv) && portEnv > 0) {
			port = portEnv;
		} else {
			port = 40241;
		}
		this.config = {
			host: config?.host ?? process.env.ONEC_IPC_HOST ?? "127.0.0.1",
			port,
			token: config?.token ?? process.env.ONEC_IPC_TOKEN ?? null,
			timeoutMs: config?.timeoutMs ?? 60000,
		};
	}

	/**
	 * Выполняет JSON-RPC запрос к IPC-серверу.
	 *
	 * @param method — имя метода (например listCommands, executeCommand)
	 * @param params — опциональные параметры
	 * @returns результат из response.result (при ошибке — reject с сообщением сервера)
	 */
	public async request<T = unknown>(
		method: string,
		params?: Record<string, unknown>
	): Promise<T> {
		const id = randomUUID();
		const payload: IpcRequestPayload = {
			id,
			method,
			params,
		};

		if (this.config.token) {
			payload.token = this.config.token;
		}

		const message = `${JSON.stringify(payload)}\n`;
		logger.debug(`IPC: запрос ${method} (id ${id}) → ${this.config.host}:${this.config.port}`);

		return new Promise<T>((resolve, reject) => {
			const socket = new net.Socket();
			let buffer = "";
			let finished = false;

			const cleanup = (): void => {
				if (!socket.destroyed) {
					socket.destroy();
				}
			};

			const onError = (error: unknown): void => {
				if (finished) {
					return;
				}
				finished = true;
				cleanup();
				const err =
					error instanceof Error
						? error
						: new Error("Неизвестная ошибка IPC-клиента");
				logger.error(`IPC: подключение ${this.config.host}:${this.config.port} — ${err.message}`);
				reject(
					new Error(
						`Не удалось подключиться к расширению 1c-platform-tools по IPC: ${err.message}`
					)
				);
			};

			const timeout = setTimeout(() => {
				if (finished) {
					return;
				}
				finished = true;
				cleanup();
				logger.error(`IPC: таймаут ${this.config.timeoutMs} мс при вызове ${method}`);
				reject(
					new Error(
						"Таймаут ожидания ответа от расширения 1c-platform-tools по IPC"
					)
				);
			}, this.config.timeoutMs);

			socket.on("error", onError);

			socket.on("data", (data: Buffer) => {
				if (finished) {
					return;
				}

				buffer += data.toString("utf8");
				const index = buffer.indexOf("\n");

				if (index === -1) {
					return;
				}

				const line = buffer.slice(0, index).trim();
				buffer = buffer.slice(index + 1);

				if (line === "") {
					return;
				}

				let response: IpcResponsePayload;
				try {
					response = JSON.parse(line) as IpcResponsePayload;
				} catch (error) {
					finished = true;
					clearTimeout(timeout);
					cleanup();
					const cause =
						error instanceof Error
							? error.message
							: "Некорректный JSON-ответ от IPC-сервера";
					logger.error(`IPC: некорректный ответ — ${cause}`);
					reject(
						new Error(
							`Некорректный ответ от расширения 1c-platform-tools по IPC: ${cause}`
						)
					);
					return;
				}

				if (response.error) {
					finished = true;
					clearTimeout(timeout);
					cleanup();
					const message =
						response.error.message || "Неизвестная ошибка IPC-сервера";
					const code = response.error.code;
					const fullMessage =
						code && code !== ""
							? `${message} (код: ${code})`
							: message;
					logger.error(`IPC: ошибка сервера — ${fullMessage}`);
					reject(new Error(fullMessage));
					return;
				}

				finished = true;
				clearTimeout(timeout);
				cleanup();
				resolve(response.result as T);
			});

			socket.connect(this.config.port, this.config.host, () => {
				socket.write(message);
			});
		});
	}

	/**
	 * Вызывает команду расширения в контексте указанного проекта.
	 *
	 * @param commandId — идентификатор команды (например 1c-platform-tools.configuration.loadFromSrc)
	 * @param args — аргументы команды (массив)
	 * @param projectPath — абсолютный путь к корню проекта 1С
	 * @returns commandResult от сервера; при ok === false выбрасывает Error
	 */
	public async executeCommand(
		commandId: string,
		args: unknown[] | undefined,
		projectPath: string
	): Promise<unknown> {
		const result = await this.request<{
			ok?: boolean;
			commandResult?: unknown;
			message?: string;
		}>("executeCommand", {
			commandId,
			args,
			projectPath,
		});

		if (result?.ok === false) {
			throw new Error(
				result.message ??
					`Команда ${commandId} вернула ok = false без сообщения`
			);
		}

		return result?.commandResult;
	}

	/**
	 * Запрашивает у расширения список зарегистрированных command ID.
	 *
	 * @returns массив command ID (пустой при недоступности расширения/IPC)
	 */
	public async listCommands(): Promise<string[]> {
		const res = await this.request<{ commands?: string[] }>("listCommands");
		return res?.commands ?? [];
	}
}

