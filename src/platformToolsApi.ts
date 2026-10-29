/**
 * Часть API 1C: Platform Tools, которой пользуется провайдер MCP-сервера VS Code.
 *
 * Модуль не зависит от VS Code API: проверка версии API проверяется тестами.
 */

/** API 1C: Platform Tools с окном для MCP-сервера. */
export interface PlatformToolsApi {
	/** Окно в реестре окон; undefined — папке не доверяют или окно не записано. */
	getMcpWindow(): Promise<string | undefined>;
}

/**
 * Даёт ли 1C: Platform Tools окно MCP-серверу: в прошлых версиях такого API нет.
 *
 * @param api — значение, которое вернула активация 1C: Platform Tools
 * @returns true, если в API есть окно для MCP-сервера
 */
export function hasMcpWindow(api: unknown): api is PlatformToolsApi {
	return typeof api === "object" && api !== null && typeof (api as Partial<PlatformToolsApi>).getMcpWindow === "function";
}
