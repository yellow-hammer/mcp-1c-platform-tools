import type { CommandDescriptor } from "./ipcClient.js";

/**
 * Формирование имён MCP-инструментов из commandId с учётом лимита длины (60 символов).
 * См. .cursor/rules/naming-abbreviations.mdc
 */

export const MCP_SERVER_NAME = "mcp-1c-platform-tools";
export const MAX_COMBINED_LENGTH = 60;

const PREFIX = "1c-platform-tools.";
const MAX_TOOL_NAME_LENGTH = MAX_COMBINED_LENGTH - MCP_SERVER_NAME.length - 2; // ": " = 2

const ABBREVIATIONS: [string, string][] = [
	["initializeProjectStructure", "initProjStruct"],
	["loadIncrementFromSrc", "loadIncFromSrc"],
	["loadFromFilesByList", "loadFromFiles"],
	["dumpIncrementToSrc", "dumpIncToSrc"],
	["blockExternalResources", "blockExtRes"],
	["decompileConfiguration", "decompileCfg"],
	["decompileExtension", "decompileExt"],
	["decompileProcessor", "decompileProc"],
	["fromEditor", "FromEd"],
	["initialize", "init"],
	["Configuration", "Cfg"],
	["Extension", "Ext"],
	["Processor", "Proc"],
	["Project", "Proj"],
	["Structure", "Struct"],
	["dependencies", "deps"],
	["External", "Ext"],
	["Resources", "Res"],
	["Database", "Db"],
	["Increment", "Inc"],
	["Artifacts", "Art"],
];

/**
 * Заменяет длинные подстроки в shortId на сокращения из ABBREVIATIONS.
 *
 * @param shortId — часть commandId без префикса 1c-platform-tools.
 * @returns строка с применёнными сокращениями
 */
function abbreviate(shortId: string): string {
	let s = shortId;
	for (const [long, short] of ABBREVIATIONS) {
		s = s.replaceAll(long, short);
	}
	return s;
}

/**
 * Преобразует commandId расширения в имя MCP-инструмента (укладывается в лимит длины).
 */
export function commandIdToToolName(commandId: string): string {
	const shortId = commandId.startsWith(PREFIX)
		? commandId.slice(PREFIX.length)
		: commandId;
	let toolName = abbreviate(shortId).replaceAll(".", "_");
	if (toolName.length > MAX_TOOL_NAME_LENGTH) {
		toolName = "1cpt_" + toolName.slice(0, MAX_TOOL_NAME_LENGTH - 5);
	}
	return toolName;
}

/**
 * Совместная длина «сервер: инструмент» для проверки лимита.
 */
export function getCombinedLength(toolName: string): number {
	return MCP_SERVER_NAME.length + 2 + toolName.length;
}

/**
 * Строит описание инструмента из заголовка команды расширения.
 *
 * Без описания агент выбирает инструмент по одному имени и промахивается:
 * заголовок и категория из package.json объясняют, что команда делает.
 *
 * @param descriptor — команда с заголовком и категорией
 * @returns описание для схемы инструмента
 */
export function describeCommand(descriptor: CommandDescriptor): string {
	const title = descriptor.title?.trim();
	const category = descriptor.category?.trim();
	// Команды, открывающие окна VS Code, исход операции не возвращают: без
	// пометки агент ждёт от них результата и считает вызов неудачным
	const uiOnly = descriptor.supportsWait === false
		? " Исход операции не возвращается: ответ подтверждает только запуск."
		: "";
	if (!title) {
		return `Команда расширения 1C: Platform Tools (${descriptor.id}).${uiOnly}`;
	}
	const scope = category ? `${category}: ` : "";
	return `${scope}${title}. Команда расширения ${descriptor.id}.${uiOnly}`;
}

/**
 * Подбирает имя инструмента, не занятое другой командой.
 *
 * Сокращения имён теоретически могут совпасть у двух команд. Повторная
 * регистрация имени в SDK бросает исключение, и без запасного имени сервер
 * остался бы вовсе без инструментов.
 *
 * @param commandId — идентификатор команды расширения
 * @param used — уже занятые имена (пополняется выбранным)
 * @returns уникальное имя инструмента
 */
export function uniqueToolName(commandId: string, used: Set<string>): string {
	const base = commandIdToToolName(commandId);
	if (!used.has(base)) {
		used.add(base);
		return base;
	}
	for (let suffix = 2; ; suffix++) {
		const trimmed = base.slice(0, MAX_TOOL_NAME_LENGTH - String(suffix).length - 1);
		const candidate = `${trimmed}_${suffix}`;
		if (!used.has(candidate)) {
			used.add(candidate);
			return candidate;
		}
	}
}
