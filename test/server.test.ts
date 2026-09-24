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
import { commandIdToToolName } from "../src/toolName.js";

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

	it("клиент получает инструкцию по работе с сервером", async () => {
		const client = await connect(new FakeGateway(DESCRIPTORS));

		const instructions = client.getInstructions() ?? "";
		assert.ok(instructions.includes(commandIdToToolName("1c-platform-tools.env.status")), instructions);
		assert.match(instructions, /wait: false/);
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
		assert.match(text, /не возвращает/);
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

	it("инструкция объясняет, как увидеть проекты и переключить текущий", async () => {
		const client = await connect(new FakeGateway(PROJECT_DESCRIPTORS));

		const instructions = client.getInstructions() ?? "";
		assert.match(instructions, /projectPath выполняет один вызов в указанном проекте и текущий проект не меняет/);
		await client.close();
	});

	it("инструкция называет инструменты так, как их регистрирует сервер", async () => {
		const client = await connect(new FakeGateway(PROJECT_DESCRIPTORS));

		const instructions = client.getInstructions() ?? "";
		const named = [...instructions.matchAll(/\b[a-z]+_[A-Za-z]+\b/g)].map((match) => match[0]);
		const real = [
			"1c-platform-tools.env.status",
			"1c-platform-tools.env.selectProfile",
			"1c-platform-tools.project.list",
			"1c-platform-tools.project.select",
			"1c-platform-tools.project.initialize",
			"1c-platform-tools.pipelines.run",
			"1c-platform-tools.server.start",
			"1c-platform-tools.odata.query",
			"1c-platform-tools.odata.setup",
		].map((id) => commandIdToToolName(id));
		assert.deepStrictEqual([...new Set(named)].sort(), [...real].sort());
		await client.close();
	});
});
