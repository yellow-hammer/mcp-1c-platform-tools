/**
 * Точка входа MCP-сервера (stdio): подключает клиента IPC к сборке сервера.
 * Список инструментов и обработка вызовов живут в server.ts.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IpcClient } from "./ipcClient.js";
import { logger } from "./loggerServer.js";
import { createMcpServer } from "./server.js";

/**
 * Возвращает версию MCP-сервера из переменной окружения или «0.0.0».
 *
 * @returns строка версии
 */
function getServerVersion(): string {
	return process.env.MCP_1C_SERVER_VERSION ?? "0.0.0";
}

/**
 * Поднимает сервер и подключает stdio-транспорт.
 */
async function main(): Promise<void> {
	const server = await createMcpServer(new IpcClient(), getServerVersion());
	await server.connect(new StdioServerTransport());
	logger.info("MCP-сервер 1C Platform Tools запущен (stdio)");
}

try {
	await main();
} catch (err) {
	logger.error(`MCP main: ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
}
