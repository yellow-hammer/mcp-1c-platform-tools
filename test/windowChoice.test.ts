/**
 * Тесты выбора окна: окно агента, адрес по projectPath и отказы вместо
 * выполнения в соседнем окне.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import * as path from "node:path";
import { agentContextFrom, agentWindow, chooseWindow, type WindowChoice } from "../src/windowChoice.js";
import type { RegisteredWindow, WindowRegistrySnapshot } from "../src/windowRegistry.js";

const WORK = path.resolve("/work");
const ERP = path.join(WORK, "erp");
const RETAIL = path.join(WORK, "retail");
const DELIVERY = path.join(ERP, "delivery");

function window(id: string, folders: string[], projects: string[] = folders): RegisteredWindow {
	return {
		id,
		pid: 1,
		app: "Visual Studio Code",
		name: path.basename(folders[0]),
		pipe: `/tmp/1cpt-${id}/channel.sock`,
		token: `secret-${id}`,
		trusted: true,
		folders,
		projects,
		currentProject: projects[0],
		updatedAt: "2026-10-28T09:00:00.000Z",
	};
}

const erpWindow = window("erp", [ERP], [ERP, DELIVERY]);
const retailWindow = window("retail", [RETAIL]);

function snapshot(...windows: RegisteredWindow[]): WindowRegistrySnapshot {
	return { windows, otherVersions: 0 };
}

/** Окно выбора либо код отказа. */
function outcome(choice: WindowChoice): string {
	return "refusal" in choice ? choice.refusal.code : choice.window.id;
}

describe("agentContextFrom", () => {
	it("окно из MCP_1C_WINDOW и каталог процесса", () => {
		assert.deepStrictEqual(agentContextFrom({ MCP_1C_WINDOW: " abc " }, RETAIL), {
			windowId: "abc",
			cwd: RETAIL,
		});
	});

	it("без переменных остаётся только каталог процесса", () => {
		assert.deepStrictEqual(agentContextFrom({}, RETAIL), { windowId: undefined, cwd: RETAIL });
	});
});

describe("окно агента", () => {
	it("окно, из которого VS Code запустил сервер, выбирается по идентификатору", () => {
		const choice = chooseWindow(snapshot(erpWindow, retailWindow), { windowId: "retail", cwd: ERP }, undefined);
		assert.strictEqual(outcome(choice), "retail");
	});

	it("окно закрыли: отказ WINDOW_CLOSED, а не другое окно", () => {
		const choice = chooseWindow(snapshot(erpWindow), { windowId: "retail" }, ERP);
		assert.strictEqual(outcome(choice), "WINDOW_CLOSED");
	});

	it("каталог агента в папке окна выбирает это окно, путь проекта уходит окну как есть", () => {
		const choice = chooseWindow(snapshot(erpWindow, retailWindow), { cwd: path.join(ERP, "src") }, "delivery");
		assert.deepStrictEqual(choice, { window: erpWindow, projectPath: "delivery" });
	});

	it("проект другого окна идёт в окно агента: отклоняет его само окно", () => {
		const choice = chooseWindow(snapshot(erpWindow, retailWindow), { cwd: ERP }, RETAIL);
		assert.deepStrictEqual(choice, { window: erpWindow, projectPath: RETAIL });
	});

	it("из вложенных папок разных окон берётся самая глубокая", () => {
		const workWindow = window("work", [WORK]);
		assert.strictEqual(outcome(chooseWindow(snapshot(workWindow, erpWindow), { cwd: DELIVERY }, undefined)), "erp");
		assert.strictEqual(outcome(chooseWindow(snapshot(workWindow, erpWindow), { cwd: RETAIL }, undefined)), "work");
	});

	it("папка открыта в двух окнах: отказ WINDOW_AMBIGUOUS", () => {
		const twin = { ...window("twin", [ERP]), app: "Cursor" };
		const choice = chooseWindow(snapshot(erpWindow, twin), { cwd: ERP }, undefined);
		assert.strictEqual(outcome(choice), "WINDOW_AMBIGUOUS");
	});

	it("агент над проектами с единственным окном внутри работает с этим окном", () => {
		assert.deepStrictEqual(agentWindow(snapshot(erpWindow), { cwd: WORK }), { window: erpWindow });
		assert.deepStrictEqual(agentWindow(snapshot(erpWindow, retailWindow), { cwd: WORK }), {});
	});

	it("агент из недоверенной папки не выполняет команды и в других окнах", () => {
		const locked = { ...window("locked", [path.resolve("/secret")]), trusted: false, pipe: "", token: "" };
		const choice = chooseWindow(snapshot(erpWindow, locked), { cwd: path.resolve("/secret") }, ERP);
		assert.strictEqual(outcome(choice), "WORKSPACE_NOT_TRUSTED");
	});

	it("путь недоверенной папки извне тоже отказ", () => {
		const locked = { ...window("locked", [path.resolve("/secret")]), trusted: false, pipe: "", token: "" };
		const choice = chooseWindow(snapshot(erpWindow, locked), { cwd: path.resolve("/home/dev") }, path.resolve("/secret"));
		assert.strictEqual(outcome(choice), "WORKSPACE_NOT_TRUSTED");
	});
});

describe("агент вне окон", () => {
	const outside = { cwd: path.resolve("/home/dev") };

	it("окно выбирается по projectPath", () => {
		const choice = chooseWindow(snapshot(erpWindow, retailWindow), outside, path.join(RETAIL, "src"));
		assert.deepStrictEqual(choice, { window: retailWindow, projectPath: path.join(RETAIL, "src") });
	});

	it("относительный projectPath считается от каталога агента", () => {
		const choice = chooseWindow(snapshot(erpWindow, retailWindow), { cwd: WORK }, "retail");
		assert.deepStrictEqual(choice, { window: retailWindow, projectPath: RETAIL });
	});

	it("проект не открыт ни в одном окне: WINDOW_NOT_FOUND со списком окон", () => {
		const choice = chooseWindow(snapshot(erpWindow), outside, path.join(WORK, "hr"));
		assert.ok("refusal" in choice);
		assert.strictEqual(choice.refusal.code, "WINDOW_NOT_FOUND");
		assert.ok(choice.refusal.message.includes(ERP), choice.refusal.message);
	});

	it("без projectPath: PROJECT_PATH_REQUIRED с открытыми проектами", () => {
		const choice = chooseWindow(snapshot(erpWindow, retailWindow), outside, undefined);
		assert.ok("refusal" in choice);
		assert.strictEqual(choice.refusal.code, "PROJECT_PATH_REQUIRED");
		assert.ok(choice.refusal.message.includes(DELIVERY) && choice.refusal.message.includes(RETAIL), choice.refusal.message);
	});

	it("окон нет: WINDOW_NOT_FOUND", () => {
		assert.strictEqual(outcome(chooseWindow(snapshot(), outside, undefined)), "WINDOW_NOT_FOUND");
		assert.strictEqual(outcome(chooseWindow(snapshot(), outside, ERP)), "WINDOW_NOT_FOUND");
	});

	it("окна только другой версии: VERSION_MISMATCH", () => {
		const choice = chooseWindow({ windows: [], otherVersions: 1 }, outside, ERP);
		assert.strictEqual(outcome(choice), "VERSION_MISMATCH");
	});

	it("отказ не раскрывает канал и токен окна", () => {
		for (const choice of [
			chooseWindow(snapshot(erpWindow, retailWindow), outside, undefined),
			chooseWindow(snapshot(erpWindow), outside, path.join(WORK, "hr")),
			chooseWindow(snapshot(erpWindow, { ...erpWindow, id: "twin" }), { cwd: ERP }, undefined),
		]) {
			assert.ok("refusal" in choice);
			const text = JSON.stringify(choice.refusal);
			assert.ok(!text.includes("secret-") && !text.includes("channel.sock"), text);
		}
	});
});
