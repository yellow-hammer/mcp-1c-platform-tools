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
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CommandDescriptor } from "../src/commandDescriptor.js";
import { ChannelError } from "../src/channelClient.js";
import { createMcpServer, CommandGateway, type McpServerOptions } from "../src/server.js";

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
		private readonly listFailures = 0,
		private readonly failure = "расширение недоступно",
		private readonly failureCode?: string
	) {}

	public async listCommandDescriptors(): Promise<CommandDescriptor[]> {
		this.listCalls += 1;
		if (this.listCalls <= this.listFailures) {
			throw this.failureCode === undefined ? new Error(this.failure) : new ChannelError(this.failure, this.failureCode);
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
		id: "1c-platform-tools.cf.loadIncrement",
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
async function connect(gateway: CommandGateway, options?: McpServerOptions): Promise<Client> {
	const server = await createMcpServer(gateway, "1.2.3", options);
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "1" });
	await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
	return client;
}

describe("createMcpServer", () => {
	it("на каждую команду расширения приходится инструмент", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		assert.strictEqual(tools.length, DESCRIPTORS.length + 1);
		assert.ok(tools.some((tool) => tool.name === "test_xunit"));
		assert.ok(tools.some((tool) => tool.name === "onec_platform_tools_status"));
		await client.close();
	});

	it("схема инструмента содержит только применимые параметры", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));
		const { tools } = await client.listTools();

		const xunit = tools.find((tool) => tool.name === "test_xunit");
		const increment = tools.find((tool) => tool.name === "cf_loadInc");
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

	it("параметры вызова доходят до команды расширения", async () => {
		const gateway = new FakeGateway(DESCRIPTORS);
		const client = await connect(gateway);

		await client.callTool({
			name: "cf_loadInc",
			arguments: { projectPath: "C:/work/erp", sha: "HEAD~1" },
		});

		assert.strictEqual(gateway.calls.length, 1);
		assert.strictEqual(gateway.calls[0].commandId, "1c-platform-tools.cf.loadIncrement");
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
			name: "cf_loadInc",
			arguments: { projectPath: "C:/work/erp", sha: "", updateDb: true },
		});

		const flags = (gateway.calls[0].args?.[0] ?? {}) as Record<string, unknown>;
		assert.strictEqual(flags.updateDb, true, "параметр команды должен доходить до расширения");
		assert.ok(!('projectPath' in flags), "projectPath адресует проект, а не команду");
		await client.close();
	});

	it("запрос к OData передаёт тело записи и параметры выборки команде", async () => {
		const gateway = new FakeGateway([
			{ id: "1c-platform-tools.odata.query", title: "Запрос к OData", category: "1С: OData", supportsWait: true },
		]);
		const client = await connect(gateway);

		await client.callTool({
			name: "odata_query",
			arguments: { resource: "Catalog_Номенклатура", method: "POST", body: '{"Description":"Стол"}', top: 1 },
		});

		const flags = (gateway.calls[0].args?.[0] ?? {}) as Record<string, unknown>;
		assert.strictEqual(gateway.calls[0].commandId, "1c-platform-tools.odata.query");
		assert.strictEqual(flags.body, '{"Description":"Стол"}');
		assert.strictEqual(flags.method, "POST");
		assert.strictEqual(flags.top, 1);
		await client.close();
	});

	it("схемы инструментов без конструкций, из-за которых Cursor отбрасывает список", async () => {
		// Cursor молча не принимает весь tools/list, если в схеме есть propertyNames
		// (z.record) или maximum 2^53 (int() в Zod 4): агенту остаётся пустой список
		const client = await connect(new FakeGateway([
			{ id: "1c-platform-tools.odata.query", supportsWait: true },
			{ id: "1c-platform-tools.odata.setup", supportsWait: true },
			...DESCRIPTORS,
		]));
		const { tools } = await client.listTools();
		const schemas = JSON.stringify(tools.map((tool) => tool.inputSchema));
		assert.ok(!schemas.includes("propertyNames"), "в схеме есть propertyNames");
		assert.ok(!schemas.includes("9007199254740991"), "в схеме есть maximum 2^53");
		await client.close();
	});

	it("команда без исхода не советует wait: true", async () => {
		const gateway = new FakeGateway(
			[{ id: "1c-platform-tools.server.start", title: "Запустить", category: "1С: Автономный сервер", supportsWait: false }],
			null
		);
		const client = await connect(gateway);
		const answer = await client.callTool({ name: "server_start", arguments: {} });
		const text = (answer.content as Array<{ text: string }>)[0].text;
		assert.doesNotMatch(text, /wait: true/);
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
		await client.close();
	});

	it("недоступное расширение оставляет заглушку вместо инструментов", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS, undefined, 1));
		const { tools } = await client.listTools();

		assert.deepStrictEqual(tools.map((tool) => tool.name), ["onec_platform_tools_status"]);
		await client.close();
	});

	it("заглушка регистрирует инструменты и остаётся в списке", async () => {
		const gateway = new FakeGateway(DESCRIPTORS, undefined, 1);
		const client = await connect(gateway);
		let changed = 0;
		client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
			changed += 1;
		});

		const retry = await client.callTool({ name: "onec_platform_tools_status", arguments: {} });
		assert.notStrictEqual(retry.isError, true);

		const { tools } = await client.listTools();
		assert.ok(tools.some((tool) => tool.name === "test_xunit"), "инструменты появились");
		assert.ok(tools.some((tool) => tool.name === "onec_platform_tools_status"), "заглушка остаётся");
		assert.ok(changed > 0, "клиент получает notifications/tools/list_changed");
		await client.close();
	});

	it("пока окна нет, сервер ждёт его и регистрирует инструменты", async () => {
		const gateway = new FakeGateway(DESCRIPTORS, undefined, 2, "нет окна", "WINDOW_NOT_FOUND");
		const started = Date.now();
		const client = await connect(gateway, { windowWaitMs: 1_000, pollMs: 20 });

		assert.ok(Date.now() - started < 900, "ожидание не должно выйти за предел");
		assert.ok(gateway.listCalls >= 3);
		const { tools } = await client.listTools();
		assert.ok(tools.some((tool) => tool.name === "test_xunit"));
		assert.ok(tools.some((tool) => tool.name === "onec_platform_tools_status"));
		await client.close();
	});

	it("окно, появившееся после старта, добавляет инструменты", async () => {
		const gateway = new FakeGateway(DESCRIPTORS, undefined, 1, "нет окна", "WINDOW_NOT_FOUND");
		const client = await connect(gateway, { windowWaitMs: 0, pollMs: 20 });
		const started = Date.now();
		let names: string[] = [];
		while (Date.now() - started < 1000) {
			names = (await client.listTools()).tools.map((tool) => tool.name);
			if (names.includes("test_xunit")) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
		assert.ok(names.includes("test_xunit"));
		assert.ok(names.includes("onec_platform_tools_status"));
		await client.close();
	});

	it("другой отказ не ждёт окно", async () => {
		const started = Date.now();
		const client = await connect(
			new FakeGateway(DESCRIPTORS, undefined, 5, "Папка не доверенная", "WORKSPACE_NOT_TRUSTED"),
			{ windowWaitMs: 5_000, pollMs: 50 }
		);

		assert.ok(Date.now() - started < 1_000);
		const { tools } = await client.listTools();
		assert.deepStrictEqual(tools.map((tool) => tool.name), ["onec_platform_tools_status"]);
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

describe("createMcpServer: проекты окна", () => {
	const PROJECT_DESCRIPTORS: CommandDescriptor[] = [
		{ id: "1c-platform-tools.project.list", title: "Показать проекты 1С", category: "1С: Проект", supportsWait: true },
		{ id: "1c-platform-tools.project.select", title: "Сделать проект текущим", category: "1С: Проект", supportsWait: true },
	];

	it("выбор проекта требует root, projectPath у инструментов проектов нет", async () => {
		const client = await connect(new FakeGateway(PROJECT_DESCRIPTORS));
		const { tools } = await client.listTools();

		const select = tools.find((tool) => tool.name === "project_select");
		const list = tools.find((tool) => tool.name === "project_list");
		assert.deepStrictEqual(select?.inputSchema.required, ["root"]);
		assert.ok(!Object.keys(select?.inputSchema.properties ?? {}).includes("projectPath"));
		assert.deepStrictEqual(Object.keys(list?.inputSchema.properties ?? {}), ["wait"]);
		await client.close();
	});

	it("корень проекта доходит до команды выбора параметром команды", async () => {
		const gateway = new FakeGateway(PROJECT_DESCRIPTORS);
		const client = await connect(gateway);

		await client.callTool({ name: "project_select", arguments: { root: "C:/work/retail" } });

		assert.strictEqual(gateway.calls[0].commandId, "1c-platform-tools.project.select");
		assert.strictEqual(gateway.calls[0].projectPath, undefined);
		assert.deepStrictEqual(gateway.calls[0].args, [{ wait: true, root: "C:/work/retail" }]);
		await client.close();
	});

	it("инициализация проекта требует каталог в projectPath и передаёт его каналу", async () => {
		const gateway = new FakeGateway([
			...PROJECT_DESCRIPTORS,
			{ id: "1c-platform-tools.project.initialize", title: "Инициализировать проект", category: "1С: Проект", supportsWait: true },
			{ id: "1c-platform-tools.dependencies.initializePackagedef", title: "Инициализировать проект", category: "1С: Зависимости", supportsWait: true },
		]);
		const client = await connect(gateway);
		const { tools } = await client.listTools();

		for (const name of ["project_init", "deps_initPackagedef"]) {
			const tool = tools.find((item) => item.name === name);
			assert.deepStrictEqual(tool?.inputSchema.required, ["projectPath"], name);
			assert.deepStrictEqual(Object.keys(tool?.inputSchema.properties ?? {}).sort(), ["projectPath", "wait"], name);
		}
		await client.callTool({ name: "project_init", arguments: { projectPath: "C:/work/erp/поставка" } });

		assert.strictEqual(gateway.calls[0].commandId, "1c-platform-tools.project.initialize");
		assert.strictEqual(gateway.calls[0].projectPath, "C:/work/erp/поставка");
		assert.deepStrictEqual(gateway.calls[0].args, [{ wait: true }]);
		await client.close();
	});
});
