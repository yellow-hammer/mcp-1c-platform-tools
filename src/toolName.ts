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
