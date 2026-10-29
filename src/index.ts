/**
 * Точка входа MCP-сервера (stdio): подключает окна 1C: Platform Tools к сборке сервера.
 * Список инструментов и обработка вызовов живут в server.ts.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./loggerServer.js";
import { createMcpServer } from "./server.js";
import { agentContextFrom } from "./windowChoice.js";
import { WindowGateway } from "./windowGateway.js";

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
	const gateway = new WindowGateway(agentContextFrom(process.env, process.cwd()));
	const server = await createMcpServer(gateway, getServerVersion());
	const transport = new StdioServerTransport();
	await server.connect(transport);
	// Клиент закрыл канал, а процесс иначе остаётся жить рядом с новым.
	process.stdin.on("end", () => {
		logger.info("клиент закрыл соединение MCP-сервера");
		process.exit(0);
	});
	logger.info("MCP-сервер 1C Platform Tools запущен (stdio)");
}

try {
	await main();
} catch (err) {
	logger.error(`MCP main: ${err instanceof Error ? err.message : String(err)}`);
	process.exitCode = 1;
}
