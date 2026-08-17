/**
 * Тесты paramsForCommand: набор параметров инструмента зависит от команды.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { paramsForCommand } from "../src/toolParams.js";

/** Имена параметров схемы для команды. */
function keys(commandId: string): string[] {
	return Object.keys(paramsForCommand(commandId)).sort();
}

describe("paramsForCommand", () => {
	it("общие параметры есть у любой команды", () => {
		for (const id of ["1c-platform-tools.test.runXUnit", "1c-platform-tools.env.selectProfile"]) {
			const shape = keys(id);
			assert.ok(shape.includes("projectPath"), `projectPath у ${id}`);
			assert.ok(shape.includes("wait"), `wait у ${id}`);
		}
	});

	it("прогон тестов не получает sha, frameworks и параметры Предприятия", () => {
		const shape = keys("1c-platform-tools.test.runXUnit");
		assert.ok(!shape.includes("sha"));
		assert.ok(!shape.includes("frameworks"));
		assert.ok(!shape.includes("execute"));
		assert.ok(shape.includes("settingsFile"), "настройки прогона нужны");
	});

	it("инкрементальная загрузка получает sha", () => {
		assert.ok(keys("1c-platform-tools.cf.loadIncrement").includes("sha"));
		assert.ok(!keys("1c-platform-tools.cf.load").includes("sha"));
	});

	it("выбор профиля получает profile и обходится без настроек прогона", () => {
		const shape = keys("1c-platform-tools.env.selectProfile");
		assert.ok(shape.includes("profile"));
		assert.ok(!shape.includes("settingsFile"));
		assert.ok(!shape.includes("ibConnection"));
	});

	it("настройка тестов получает frameworks", () => {
		assert.ok(keys("1c-platform-tools.test.configure").includes("frameworks"));
	});

	it("командам тестовых расширений тоже доступен отбор", () => {
		assert.ok(keys("1c-platform-tools.test.loadExtensions").includes("extensions"));
		assert.ok(keys("1c-platform-tools.test.buildExtensions").includes("extensions"));
		assert.ok(!keys("1c-platform-tools.test.yaxunit").includes("extensions"));
	});

	it("команды расширений конфигурации получают extensions", () => {
		assert.ok(keys("1c-platform-tools.cfe.compile").includes("extensions"));
		assert.ok(!keys("1c-platform-tools.build.cf").includes("extensions"));
	});

	it("запуск Предприятия получает execute и command: ими открывают обработку", () => {
		const shape = keys("1c-platform-tools.run.enterprise");
		assert.ok(shape.includes("execute"));
		assert.ok(shape.includes("command"));
	});

	it("схема заметно короче прежней общей", () => {
		assert.ok(keys("1c-platform-tools.env.selectProfile").length <= 3);
	});
});

describe("paramsForCommand: сеансы и цепочки", () => {
	it("сеансам доступны параметры разового вызова", () => {
		const lock = Object.keys(paramsForCommand("1c-platform-tools.session.lock"));
		assert.ok(lock.includes("lockMessage"), "нет сообщения блокировки");
		assert.ok(lock.includes("accessCode"), "нет кода допуска");
		assert.ok(!lock.includes("sessionFilter"), "отбор нужен только завершению сеансов");

		const kill = Object.keys(paramsForCommand("1c-platform-tools.session.kill"));
		assert.ok(kill.includes("sessionFilter"), "нет отбора сеансов");
		assert.ok(kill.includes("keepSessionsUnlocked"), "нет отказа от блокировки");
	});

	it("завершение, проверка и список сеансов различаются параметрами", () => {
		const kill = Object.keys(paramsForCommand("1c-platform-tools.session.kill"));
		assert.ok(kill.includes("sessionRetry"), "нечем задать число попыток");
		assert.ok(kill.includes("sessionTimeout"), "нечем задать ожидание");

		const closed = Object.keys(paramsForCommand("1c-platform-tools.session.checkClosed"));
		assert.ok(closed.includes("sessionTimeout"), "нечем подождать освобождения базы");
		assert.ok(!closed.includes("keepSessionsUnlocked"), "проверка сеансы не завершает");

		const list = Object.keys(paramsForCommand("1c-platform-tools.session.list"));
		assert.ok(list.includes("sessionConnections"), "нечем запросить соединения");
		assert.ok(list.includes("sessionFilter"), "список тоже умеет отбор");
		assert.ok(!list.includes("keepSessionsUnlocked"), "список ничего не завершает");
	});

	it("запуск цепочки требует идентификатор пайплайна", () => {
		const shape = paramsForCommand("1c-platform-tools.pipelines.run");
		assert.ok("pipeline" in shape, "агенту нечем выбрать цепочку");
		assert.ok(!("settingsFile" in shape), "настройки vanessa-runner цепочке не задаются");
	});

	it("запуск Предприятия принимает обработку и параметры запуска", () => {
		const shape = Object.keys(paramsForCommand("1c-platform-tools.run.enterprise"));
		assert.ok(shape.includes("execute"), "нет пути к обработке");
		assert.ok(shape.includes("command"), "нет строки параметров /C");
	});
});
