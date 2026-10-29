/**
 * Выбор окна 1C: Platform Tools для вызова инструмента.
 *
 * Окно агента — окно, из которого его запустил VS Code, или окно, в папке
 * которого запущен процесс. Вызовы идут в него, а
 * проект другого окна оно отклоняет само (WORKSPACE_MISMATCH): соседнее окно
 * молча не выполняет чужое. Агент, запущенный вне окон, адресует окно путём
 * проекта. Модуль не читает файлов и не открывает каналов: решения проверяются тестами.
 */
import * as path from "node:path";
import type { RegisteredWindow, WindowRegistrySnapshot } from "./windowRegistry.js";

/** Откуда сервер знает окно агента. */
export interface AgentContext {
	/** Окно, из которого сервер запустил VS Code (MCP_1C_WINDOW). */
	windowId?: string;
	/** Каталог, из которого клиент запустил сервер. */
	cwd?: string;
}

/** Причины отказа: агент видит код в ответе инструмента. */
export type WindowRefusalCode =
	| "WINDOW_CLOSED"
	| "WINDOW_NOT_FOUND"
	| "WINDOW_AMBIGUOUS"
	| "PROJECT_PATH_REQUIRED"
	| "VERSION_MISMATCH"
	| "WORKSPACE_NOT_TRUSTED";

/** Отказ: что случилось, что сделать и какие окна открыты. */
export interface WindowRefusal {
	code: WindowRefusalCode;
	message: string;
	details?: unknown;
}

/** Окно для вызова и путь проекта, который ему передать. */
export type WindowChoice = { window: RegisteredWindow; projectPath?: string } | { refusal: WindowRefusal };

/**
 * Контекст агента из переменных окружения сервера.
 *
 * @param env — переменные окружения
 * @param cwd — текущий каталог процесса
 * @returns окно и каталог агента
 */
export function agentContextFrom(env: NodeJS.ProcessEnv, cwd: string): AgentContext {
	const windowId = env.MCP_1C_WINDOW?.trim();
	return {
		windowId: windowId || undefined,
		cwd,
	};
}

/** Лежит ли каталог в корне или ниже; на Windows регистр не важен. */
function isSameOrUnder(target: string, root: string): boolean {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Окна, в папке которых лежит путь; из нескольких берётся окно с самой
 * глубокой папкой, равные остаются все.
 */
function windowsContaining(windows: readonly RegisteredWindow[], target: string): RegisteredWindow[] {
	let depth = -1;
	let found: RegisteredWindow[] = [];
	for (const window of windows) {
		const folders = window.folders.filter((folder) => isSameOrUnder(target, folder));
		if (folders.length === 0) {
			continue;
		}
		const deepest = Math.max(...folders.map((folder) => path.resolve(folder).length));
		if (deepest > depth) {
			depth = deepest;
			found = [window];
		} else if (deepest === depth) {
			found.push(window);
		}
	}
	return found;
}

/** Окна для отказа: без канала и токена, они агенту не нужны. */
function windowList(windows: readonly RegisteredWindow[]): unknown[] {
	return windows.map((window) => ({
		name: window.name,
		app: window.app,
		folders: window.folders,
		projects: window.projects,
		currentProject: window.currentProject,
	}));
}

/**
 * Окна строкой для сообщений агенту.
 *
 * @param windows — окна
 * @returns имя, редактор и проекты каждого окна
 */
export function describeWindows(windows: readonly RegisteredWindow[]): string {
	return windows
		.map((window) => {
			const roots = window.projects.length > 0 ? window.projects : window.folders;
			return `«${window.name}» (${window.app}): ${roots.join(", ")}`;
		})
		.join("; ");
}

/** Отказ, когда подходящего окна нет. */
function noWindow(snapshot: WindowRegistrySnapshot, message: string, details: Record<string, unknown> = {}): WindowRefusal {
	if (snapshot.windows.length === 0 && snapshot.otherVersions > 0) {
		return {
			code: "VERSION_MISMATCH",
			message:
				"Окно открыто с другой версией 1C: Platform Tools. " +
				"Обновите 1C: Platform Tools и 1C: Platform Tools MCP до последних версий и перезапустите MCP-сервер",
		};
	}
	if (snapshot.windows.length === 0) {
		return { code: "WINDOW_NOT_FOUND", message, details: Object.keys(details).length > 0 ? details : undefined };
	}
	return {
		code: "WINDOW_NOT_FOUND",
		message: `${message}. Открытые окна: ${describeWindows(snapshot.windows)}`,
		details: { ...details, windows: windowList(snapshot.windows) },
	};
}

/**
 * Отказ, когда открытых окон нет совсем.
 *
 * @param snapshot — реестр без окон этой версии
 * @returns отказ WINDOW_NOT_FOUND или VERSION_MISMATCH
 */
export function noWindows(snapshot: WindowRegistrySnapshot): WindowRefusal {
	return noWindow(snapshot, "Нет окон VS Code или Cursor с 1C: Platform Tools. Откройте проект 1С и повторите вызов");
}

/** Отказ недоверенной папки: команды не выполняются и в других окнах. */
function untrusted(window: RegisteredWindow): WindowRefusal {
	return {
		code: "WORKSPACE_NOT_TRUSTED",
		message:
			"Папка не доверенная, агент команды не выполняет. Подтвердите доверие папке и повторите вызов.",
		details: { windows: windowList([window]) },
	};
}

/** Окно агента либо отказ, если папке не доверяют. */
function agentOrUntrusted(window: RegisteredWindow): { window: RegisteredWindow } | { refusal: WindowRefusal } {
	return window.trusted ? { window } : { refusal: untrusted(window) };
}

function ambiguous(target: string, windows: readonly RegisteredWindow[]): WindowRefusal {
	return {
		code: "WINDOW_AMBIGUOUS",
		message: `Каталог ${target} открыт в нескольких окнах: ${describeWindows(windows)}. Оставьте его открытым в одном окне`,
		details: { path: target, windows: windowList(windows) },
	};
}

/**
 * Окно агента: окно, из которого его запустил VS Code, окно, в папке которого
 * лежит каталог агента, либо единственное окно с папками внутри этого каталога.
 * Недоверенная папка — отказ: агент из неё с другими окнами не работает.
 *
 * @param snapshot — открытые окна
 * @param context — окно и каталог агента
 * @returns окно агента, отказ либо ничего, если агент запущен вне окон
 */
export function agentWindow(
	snapshot: WindowRegistrySnapshot,
	context: AgentContext
): { window?: RegisteredWindow } | { refusal: WindowRefusal } {
	if (context.windowId !== undefined) {
		const window = snapshot.windows.find((candidate) => candidate.id === context.windowId);
		if (window) {
			return agentOrUntrusted(window);
		}
		return {
			refusal: {
				code: "WINDOW_CLOSED",
				message: "Окно, из которого запущен MCP-сервер, закрыто или перезагружено. Перезапустите MCP-сервер",
			},
		};
	}
	const anchor = context.cwd;
	if (anchor === undefined) {
		return {};
	}
	const containing = windowsContaining(snapshot.windows, anchor);
	if (containing.length > 1) {
		return { refusal: ambiguous(anchor, containing) };
	}
	if (containing.length === 1) {
		return agentOrUntrusted(containing[0]);
	}
	const below = snapshot.windows.filter((window) => window.folders.some((folder) => isSameOrUnder(folder, anchor)));
	if (below.length === 1) {
		return agentOrUntrusted(below[0]);
	}
	return {};
}

/**
 * Окно для вызова инструмента.
 *
 * У агента из окна вызов идёт в его окно: путь проекта проверяет само окно.
 * Агенту вне окон окно выбирается по projectPath, относительный путь считается
 * от каталога агента; без projectPath вызов отклоняется.
 *
 * @param snapshot — открытые окна
 * @param context — окно и каталог агента
 * @param projectPath — путь проекта из вызова
 * @returns окно и путь для него либо отказ
 */
export function chooseWindow(
	snapshot: WindowRegistrySnapshot,
	context: AgentContext,
	projectPath: string | undefined
): WindowChoice {
	const own = agentWindow(snapshot, context);
	if ("refusal" in own) {
		return own;
	}
	if (own.window) {
		return { window: own.window, projectPath };
	}
	const workspace = context.cwd;
	if (projectPath === undefined) {
		if (snapshot.windows.length === 0) {
			return { refusal: noWindows(snapshot) };
		}
		return {
			refusal: {
				code: "PROJECT_PATH_REQUIRED",
				message:
					`Агент запущен не из окна с проектом 1С: передайте projectPath открытого проекта. ` +
					`Открытые окна: ${describeWindows(snapshot.windows)}`,
				details: { workspace, windows: windowList(snapshot.windows) },
			},
		};
	}
	if (!path.isAbsolute(projectPath) && workspace === undefined) {
		return {
			refusal: {
				code: "PROJECT_PATH_REQUIRED",
				message: "Передайте в projectPath абсолютный путь проекта",
				details: { projectPath },
			},
		};
	}
	const target = path.resolve(workspace ?? "", projectPath);
	const found = windowsContaining(snapshot.windows, target);
	if (found.length > 1) {
		return { refusal: ambiguous(target, found) };
	}
	if (found.length === 1 && !found[0].trusted) {
		return { refusal: untrusted(found[0]) };
	}
	if (found.length === 0) {
		return {
			refusal: noWindow(
				snapshot,
				`Проект ${target} не открыт в окнах VS Code или Cursor с 1C: Platform Tools. Откройте его и повторите вызов`,
				{ projectPath: target }
			),
		};
	}
	return { window: found[0], projectPath: target };
}

/**
 * Окна, в которых открыт путь, кроме окна агента: им дополняется отказ
 * WORKSPACE_MISMATCH, чтобы агент знал, где проект.
 *
 * @param snapshot — открытые окна
 * @param own — окно агента
 * @param target — абсолютный путь проекта
 * @returns другие окна с этим путём
 */
export function otherWindowsWith(
	snapshot: WindowRegistrySnapshot,
	own: RegisteredWindow,
	target: string
): RegisteredWindow[] {
	return windowsContaining(
		snapshot.windows.filter((window) => window.id !== own.id),
		target
	);
}
