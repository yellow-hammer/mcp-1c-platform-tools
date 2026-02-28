/**
 * Standalone MCP-сервер (stdio): получает список команд расширения по IPC,
 * регистрирует по одному инструменту на команду и обслуживает вызовы через stdio.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IpcClient } from "./ipcClient.js";
import { formatCommandResult } from "./formatCommandResult.js";
import { logger } from "./loggerServer.js";
import { commandIdToToolName } from "./toolName.js";

/** Схема параметров инструментов (projectPath обязателен, остальное опционально). */
const baseParamsShape = {
  projectPath: z
    .string()
    .min(1, "projectPath не должен быть пустым")
    .describe("Абсолютный путь к корню проекта 1С (где лежит packagedef/env.json)"),
  settingsFile: z
    .string()
    .optional()
    .describe("Путь к env.json относительно projectPath. По умолчанию: env.json"),
  ibConnection: z
    .string()
    .optional()
    .describe("Явная строка подключения к ИБ. Если не задана, берётся из env.json или /F./build/ib"),
  pathsOverride: z
    .object({
      cf: z.string().optional(),
      out: z.string().optional(),
      cfe: z.string().optional(),
      epf: z.string().optional(),
      erf: z.string().optional(),
    })
    .optional()
    .describe("Переопределение стандартных путей src/cf, build/out, src/cfe, src/epf, src/erf относительно projectPath"),
} as const;

/** Тип параметров инструмента, выводимый из baseParamsShape. */
type BaseParams = {
  [K in keyof typeof baseParamsShape]: z.infer<(typeof baseParamsShape)[K]>;
};

/**
 * Выполняет команду расширения по IPC и возвращает контент для MCP-инструмента.
 *
 * @param ipcClient — клиент IPC
 * @param commandId — идентификатор команды расширения
 * @param params — параметры (используется projectPath)
 * @returns контент с типом "text" (успех или сообщение об ошибке)
 */
async function runTool(
  ipcClient: IpcClient,
  commandId: string,
  params: BaseParams
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    const result = await ipcClient.executeCommand(
      commandId,
      [],
      params.projectPath
    );
    const text = formatCommandResult(result);
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`runTool ${commandId}: ${message}`);
    return {
      content: [
        {
          type: "text",
          text: `Не удалось выполнить команду: ${message}`,
        },
      ],
    };
  }
}

/** Версия: из env (расширение передаёт при запуске процесса) или по умолчанию. */
function getServerVersion(): string {
	return process.env.MCP_1C_SERVER_VERSION ?? "0.0.0";
}

/**
 * Инициализация MCP-сервера: получение списка команд по IPC, регистрация инструментов, подключение stdio-транспорта.
 */
async function main(): Promise<void> {
	const version = getServerVersion();
  const server = new McpServer(
    {
      name: "mcp-1c-platform-tools",
      version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const ipcClient = new IpcClient();

  let commandIds: string[] = [];
  try {
    commandIds = await ipcClient.listCommands();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`Не удалось получить список команд по IPC: ${message}. Включите расширение 1c-platform-tools и настройку 1c-platform-tools.ipc.enabled.`);
    server.registerTool(
      "onec_platform_tools_status",
      { inputSchema: { message: z.string().optional().describe("Не используется") } },
      async () => ({
        content: [
          {
            type: "text" as const,
            text: "Расширение 1c-platform-tools недоступно по IPC. Откройте VS Code с проектом 1С и включите настройку 1c-platform-tools.ipc.enabled.",
          },
        ],
      })
    );
  }

  for (const commandId of commandIds) {
    const toolName = commandIdToToolName(commandId);
    server.registerTool(
      toolName,
      { inputSchema: baseParamsShape },
      async (input) => runTool(ipcClient, commandId, input as BaseParams)
    );
  }

  if (commandIds.length > 0) {
    logger.info(`MCP-сервер: зарегистрировано ${commandIds.length} инструментов`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP-сервер 1C Platform Tools запущен (stdio)");
}

try {
  await main();
} catch (err) {
  logger.error(`MCP main: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
