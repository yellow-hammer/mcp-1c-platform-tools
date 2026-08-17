/**
 * Тесты сборки MCP-сервера: проверяют то, что видит агент.
 *
 * Сервер поднимается целиком и опрашивается настоящим клиентом MCP через
 * транспорт в памяти, а команды расширения подменяются подделкой: так
 * проверяются список инструментов, схемы параметров и признак ошибки.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, CommandGateway } from "../src/server.js";
import type { CommandDescriptor } from "../src/ipcClient.js";

/** Вызов команды, записанный подделкой шлюза. */
interface RecordedCall {
	commandId: string;
	args: unknown[] | undefined;
	projectPath: string | undefined;
}

/** Подделка источника команд: отдаёт заданный список и записывает вызовы. */
class FakeGateway implements CommandGateway {
	public readonly calls: RecordedCall[] = [];
	public listCalls = 0;

	constructor(
		private readonly descriptors: CommandDescriptor[],
		private readonly result: unknown = { success: true, exitCode: 0, stdout: "готово", stderr: "" },
		private readonly listFailures = 0
	) {}

	public async listCommandDescriptors(): Promise<CommandDescriptor[]> {
		this.listCalls += 1;
		if (this.listCalls <= this.listFailures) {
			throw new Error("расширение недоступно");
		}
		return this.descriptors;
	}

	public async executeCommand(
		commandId: string,
		args: unknown[] | undefined,
		projectPath: string | undefined
	): Promise<unknown> {
		this.calls.push({ commandId, args, projectPath });
		return this.result;
	}
}

const DESCRIPTORS: CommandDescriptor[] = [
	{
		id: "1c-platform-tools.test.xunit",
		title: "XUnit тесты",
		category: "1C: Тестирование",
		supportsWait: true,
	},
	{
		id: "1c-platform-tools.configuration.loadIncrementFromSrc",
		title: "Загрузить изменения (git diff)",
		category: "1C: Конфигурация",
		supportsWait: true,
	},
	{
		id: "1c-platform-tools.run.designer",
		title: "Запустить Конфигуратор",
		category: "1C: Запуск",
		supportsWait: false,
	},
];

/** Поднимает сервер с подделкой шлюза и подключает к нему клиента MCP. */
async function connect(gateway: CommandGateway): Promise<Client> {
	const server = await createMcpServer(gateway, "1.2.3");
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "1" });
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return client;
}

describe("createMcpServer", () => {
	it("на каждую команду расширения приходится инструмент", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		assert.strictEqual(tools.length, DESCRIPTORS.length);
		assert.ok(tools.some((tool) => tool.name === "test_xunit"));
		await client.close();
	});

	it("описание инструмента строится из заголовка команды", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		const xunit = tools.find((tool) => tool.name === "test_xunit");
		assert.match(xunit?.description ?? "", /1C: Тестирование: XUnit тесты/);
		assert.match(xunit?.description ?? "", /1c-platform-tools\.test\.xunit/);
		await client.close();
	});

	it("команда без синхронного результата предупреждает об этом", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		const designer = tools.find((tool) => tool.name === "run_designer");
		assert.match(designer?.description ?? "", /Исход операции не возвращается/);
		await client.close();
	});

	it("схема инструмента содержит только применимые параметры", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		const xunit = tools.find((tool) => tool.name === "test_xunit");
		const increment = tools.find((tool) => tool.name === "configuration_loadIncFromSrc");
		const xunitProps = Object.keys(xunit?.inputSchema.properties ?? {});
		const incrementProps = Object.keys(increment?.inputSchema.properties ?? {});

		assert.ok(xunitProps.includes("projectPath") && xunitProps.includes("wait"));
		assert.ok(!xunitProps.includes("sha"), "sha прогону тестов не нужен");
		assert.ok(incrementProps.includes("sha"), "инкрементальной загрузке sha нужен");
		await client.close();
	});

	it("путь проекта не обязателен", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		const required = tools.find((tool) => tool.name === "test_xunit")?.inputSchema.required ?? [];
		assert.ok(!required.includes("projectPath"), `projectPath оказался обязательным: ${required}`);
		await client.close();
	});

	it("клиент получает инструкцию по работе с сервером", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));

		const instructions = client.getInstructions() ?? "";
		assert.match(instructions, /onec_env_status/);
		assert.match(instructions, /wait: false/);
		await client.close();
	});

	it("параметры вызова доходят до команды расширения", async () => {
		const gateway = new FakeGateway(DESCRIPTORS);
		const client = await connect(gateway);

		await client.callTool({
			name: "configuration_loadIncFromSrc",
			arguments: { projectPath: "C:/work/erp", sha: "HEAD~1" },
		});

		assert.strictEqual(gateway.calls.length, 1);
		assert.strictEqual(gateway.calls[0].commandId, "1c-platform-tools.configuration.loadIncrementFromSrc");
		assert.strictEqual(gateway.calls[0].projectPath, "C:/work/erp");
		const flags = (gateway.calls[0].args?.[0] ?? {}) as Record<string, unknown>;
		assert.strictEqual(flags.sha, "HEAD~1");
		assert.strictEqual(flags.wait, true, "по умолчанию команда выполняется синхронно");
		await client.close();
	});

	it("до команды доходит каждый параметр из схемы инструмента", async () => {
		// Схема принимала параметры сеансов, цепочек и обновления БД, а до расширения
		// доходил только перечисленный вручную набор: агент задавал их вхолостую.
		const gateway = new FakeGateway(DESCRIPTORS);
		const client = await connect(gateway);

		await client.callTool({
			name: "configuration_loadIncFromSrc",
			arguments: { projectPath: "C:/work/erp", sha: "", updateDb: true },
		});

		const flags = (gateway.calls[0].args?.[0] ?? {}) as Record<string, unknown>;
		assert.strictEqual(flags.updateDb, true, "параметр команды должен доходить до расширения");
		assert.ok(!('projectPath' in flags), "projectPath адресует проект, а не команду");
		await client.close();
	});

	it("упавшие тесты помечают ответ как неуспешный", async () => {
		const failing = {
			success: true,
			exitCode: 0,
			stdout: "",
			stderr: "",
			tests: {
				total: 3, passed: 1, failed: 2, errors: 0, skipped: 0,
				reportPath: "build/out/junit", failedTests: ["Тест"],
			},
		};
		const client = await connect(new FakeGateway(DESCRIPTORS, failing));

		const result = await client.callTool({
			name: "test_xunit",
			arguments: { projectPath: "C:/work/erp" },
		});

		assert.strictEqual(result.isError, true);
		assert.match(JSON.stringify(result.content), /Тесты не пройдены/);
		await client.close();
	});

	it("успешный прогон приходит без признака ошибки", async () => {
		const green = {
			success: true,
			exitCode: 0,
			stdout: "",
			stderr: "",
			tests: {
				total: 3, passed: 3, failed: 0, errors: 0, skipped: 0,
				reportPath: "build/out/junit", failedTests: [],
			},
		};
		const client = await connect(new FakeGateway(DESCRIPTORS, green));

		const result = await client.callTool({
			name: "test_xunit",
			arguments: { projectPath: "C:/work/erp" },
		});

		assert.notStrictEqual(result.isError, true);
		assert.match(JSON.stringify(result.content), /Тесты пройдены/);
		await client.close();
	});

	it("недоступное расширение оставляет заглушку вместо инструментов", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS, undefined, 1));
		const { tools } = await client.listTools();

		assert.deepStrictEqual(tools.map((tool) => tool.name), ["onec_platform_tools_status"]);
		await client.close();
	});

	it("заглушка регистрирует инструменты после повторного подключения", async () => {
		const gateway = new FakeGateway(DESCRIPTORS, undefined, 1);
		const client = await connect(gateway);

		const retry = await client.callTool({ name: "onec_platform_tools_status", arguments: {} });
		assert.notStrictEqual(retry.isError, true);

		const { tools } = await client.listTools();
		assert.ok(tools.some((tool) => tool.name === "test_xunit"), "инструменты появились");
		assert.ok(
			!tools.some((tool) => tool.name === "onec_platform_tools_status"),
			"заглушка снята"
		);
		await client.close();
	});

	it("имена инструментов не повторяются", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		const names = tools.map((tool) => tool.name);
		assert.strictEqual(new Set(names).size, names.length, `имена повторяются: ${names}`);
		await client.close();
	});
});
