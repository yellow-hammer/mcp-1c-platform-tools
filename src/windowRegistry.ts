/**
 * Реестр окон 1C: Platform Tools: какие папки и проекты обслуживает окно и где
 * слушает его канал. Записи пишут окна, сервер их только читает.
 *
 * Каталог и формат записи задаёт 1c-platform-tools (`src/shared/windowRegistry.ts`),
 * при смене формата правятся оба репозитория.
 */
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Версия формата записи, которую понимает сервер. */
export const WINDOW_RECORD_VERSION = 1;

/** Окно из реестра. */
export interface RegisteredWindow {
	/** Идентификатор окна. */
	id: string;
	/** Процесс хоста расширений окна. */
	pid: number;
	/** Редактор окна: Visual Studio Code, Cursor. */
	app: string;
	/** Имя окна: папка или рабочая область. */
	name: string;
	/** Путь канала окна. */
	pipe: string;
	/** Токен канала окна. */
	token: string;
	/** false: папке не доверяют, канала нет, команды агента не выполняются. */
	trusted: boolean;
	/** Папки рабочей области. */
	folders: string[];
	/** Проекты окна: каталоги с packagedef. */
	projects: string[];
	/** Текущий проект окна. */
	currentProject?: string;
	/** Время записи. */
	updatedAt: string;
}

/** Открытые окна и сколько окон открыто с другой версией формата. */
export interface WindowRegistrySnapshot {
	windows: RegisteredWindow[];
	/** Окна другой версии 1C: Platform Tools: сервер их не понимает. */
	otherVersions: number;
}

/**
 * Каталог реестра окон.
 *
 * @param home — домашний каталог пользователя
 * @returns путь каталога
 */
export function windowRegistryDir(home: string = os.homedir()): string {
	return path.join(home, ".1c-platform-tools", "windows");
}

/**
 * Жив ли процесс.
 *
 * @param pid — идентификатор процесса
 * @returns true, если процесс есть
 */
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// EPERM: процесс есть, но сигналы ему слать нельзя
		return (err as NodeJS.ErrnoException).code === "EPERM";
	}
}

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Запись окна этой версии, запись другой версии или не запись. */
type ParsedRecord = { window: RegisteredWindow } | { otherVersion: number } | undefined;

/**
 * Разбирает запись окна.
 *
 * @param text — содержимое файла записи
 * @returns окно, процесс окна другой версии либо undefined
 */
function parseRecord(text: string): ParsedRecord {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	if (typeof record.pid !== "number") {
		return undefined;
	}
	if (record.version !== WINDOW_RECORD_VERSION) {
		return typeof record.version === "number" ? { otherVersion: record.pid } : undefined;
	}
	const valid =
		typeof record.id === "string" &&
		typeof record.app === "string" &&
		typeof record.name === "string" &&
		typeof record.pipe === "string" &&
		typeof record.token === "string" &&
		typeof record.trusted === "boolean" &&
		isStringList(record.folders) &&
		isStringList(record.projects) &&
		(record.currentProject === undefined || typeof record.currentProject === "string") &&
		typeof record.updatedAt === "string";
	if (!valid) {
		return undefined;
	}
	return {
		window: {
			id: record.id as string,
			pid: record.pid,
			app: record.app as string,
			name: record.name as string,
			pipe: record.pipe as string,
			token: record.token as string,
			trusted: record.trusted as boolean,
			folders: record.folders as string[],
			projects: record.projects as string[],
			currentProject: record.currentProject as string | undefined,
			updatedAt: record.updatedAt as string,
		},
	};
}

/**
 * Открытые окна из реестра.
 *
 * Окно, процесс которого завершился, или окно без сокета не берётся: такая
 * запись остаётся от упавшего окна, а сокет во временном каталоге могла
 * удалить чистка системы.
 *
 * @param dir — каталог реестра
 * @param isAlive — проверка процесса
 * @returns окна и число окон другой версии
 */
export async function readWindowRegistry(
	dir: string = windowRegistryDir(),
	isAlive: (pid: number) => boolean = isProcessAlive
): Promise<WindowRegistrySnapshot> {
	let names: string[];
	try {
		names = await fs.readdir(dir);
	} catch {
		return { windows: [], otherVersions: 0 };
	}
	const windows: RegisteredWindow[] = [];
	let otherVersions = 0;
	for (const name of names.filter((entry) => entry.endsWith(".json"))) {
		const text = await fs.readFile(path.join(dir, name), "utf8").catch(() => undefined);
		const parsed = text === undefined ? undefined : parseRecord(text);
		if (!parsed) {
			continue;
		}
		if ("otherVersion" in parsed) {
			otherVersions += isAlive(parsed.otherVersion) ? 1 : 0;
			continue;
		}
		const { window } = parsed;
		if (!isAlive(window.pid)) {
			continue;
		}
		// Недоверенная папка записана без канала: её нужно видеть, чтобы не
		// принять агента из неё за агента вне окон.
		if (!window.trusted) {
			windows.push(window);
			continue;
		}
		// Именованный канал Windows исчезает вместе с процессом, Unix-сокет остаётся файлом
		if (process.platform === "win32" || existsSync(window.pipe)) {
			windows.push(window);
		}
	}
	return { windows, otherVersions };
}
