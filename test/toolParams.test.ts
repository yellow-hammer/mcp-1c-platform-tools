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
		assert.ok(keys("1c-platform-tools.configuration.loadIncrementFromSrc").includes("sha"));
		assert.ok(!keys("1c-platform-tools.configuration.loadFromSrc").includes("sha"));
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

	it("команды расширений конфигурации получают extensions", () => {
		assert.ok(keys("1c-platform-tools.extensions.build").includes("extensions"));
		assert.ok(!keys("1c-platform-tools.build.cf").includes("extensions"));
	});

	it("запуск обработки в Предприятии получает execute и command", () => {
		const shape = keys("1c-platform-tools.externalProcessors.run");
		assert.ok(shape.includes("execute"));
		assert.ok(shape.includes("command"));
	});

	it("каталоги проекта переопределяются там, где идёт работа с исходниками", () => {
		assert.ok(keys("1c-platform-tools.configuration.loadFromSrc").includes("pathsOverride"));
		assert.ok(!keys("1c-platform-tools.env.selectProfile").includes("pathsOverride"));
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
