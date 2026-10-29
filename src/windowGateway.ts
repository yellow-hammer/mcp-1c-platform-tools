/**
 * Команды расширения через окно 1C: Platform Tools.
 *
 * Окно выбирается заново на каждый вызов по реестру окон: окно могли закрыть,
 * открыть заново или открыть в нём другой проект.
 */
import * as path from "node:path";
import type { CommandDescriptor } from "./commandDescriptor.js";
import { ChannelClient, ChannelError } from "./channelClient.js";
import type { CommandGateway } from "./server.js";
import {
	agentWindow,
	chooseWindow,
	describeWindows,
	noWindows,
	otherWindowsWith,
	type AgentContext,
	type WindowRefusal,
} from "./windowChoice.js";
import { readWindowRegistry, type RegisteredWindow, type WindowRegistrySnapshot } from "./windowRegistry.js";

/** Где искать окна: в работе реестр пользователя, в тестах свой каталог. */
export interface WindowGatewayOptions {
	/** Каталог реестра окон. */
	registryDir?: string;
	/** Проверка процесса окна. */
	isAlive?: (pid: number) => boolean;
}

/**
 * Ошибка вызова с отказом выбора окна.
 *
 * @param refusal — отказ
 * @returns ошибка с текстом для агента
 */
function refusalError(refusal: WindowRefusal): ChannelError {
	return new ChannelError(refusal.message, refusal.code, refusal.details);
}

/** Самое свежее окно: из него берётся список команд, когда агент запущен вне окон. */
function newest(windows: readonly RegisteredWindow[]): RegisteredWindow | undefined {
	return [...windows]
		.filter((window) => window.trusted)
		.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

/** Шлюз команд к окнам 1C: Platform Tools. */
export class WindowGateway implements CommandGateway {
	/**
	 * @param context — окно и каталог агента
	 * @param options — каталог реестра и проверка процесса
	 */
	constructor(
		private readonly context: AgentContext,
		private readonly options: WindowGatewayOptions = {}
	) {}

	private snapshot(): Promise<WindowRegistrySnapshot> {
		return readWindowRegistry(this.options.registryDir, this.options.isAlive);
	}

	/**
	 * Список команд окна агента, а у агента вне окон — любого открытого окна.
	 *
	 * @returns описания команд
	 */
	async listCommandDescriptors(): Promise<CommandDescriptor[]> {
		const snapshot = await this.snapshot();
		const own = agentWindow(snapshot, this.context);
		if ("refusal" in own) {
			throw refusalError(own.refusal);
		}
		const window = own.window ?? newest(snapshot.windows);
		if (!window) {
			throw refusalError(noWindows(snapshot));
		}
		return new ChannelClient({ pipe: window.pipe, token: window.token }).listCommandDescriptors();
	}

	/**
	 * Выполняет команду в выбранном окне.
	 *
	 * @param commandId — идентификатор команды
	 * @param args — аргументы команды
	 * @param projectPath — путь проекта из вызова
	 * @param timeoutMs — таймаут ожидания
	 * @returns результат команды
	 */
	async executeCommand(
		commandId: string,
		args: unknown[] | undefined,
		projectPath: string | undefined,
		timeoutMs?: number
	): Promise<unknown> {
		const snapshot = await this.snapshot();
		const choice = chooseWindow(snapshot, this.context, projectPath);
		if ("refusal" in choice) {
			throw refusalError(choice.refusal);
		}
		const client = new ChannelClient({ pipe: choice.window.pipe, token: choice.window.token });
		try {
			return await client.executeCommand(commandId, args, choice.projectPath, timeoutMs);
		} catch (err) {
			if (err instanceof ChannelError && err.code === "WORKSPACE_MISMATCH") {
				throw withOtherWindows(err, snapshot, choice.window, projectPath);
			}
			throw err;
		}
	}
}

/**
 * Дополняет отказ окна WORKSPACE_MISMATCH: где открыт проект и что делать агенту.
 *
 * @param err — отказ окна
 * @param snapshot — открытые окна
 * @param own — окно агента
 * @param projectPath — путь проекта из вызова
 * @returns отказ с подсказкой
 */
function withOtherWindows(
	err: ChannelError,
	snapshot: WindowRegistrySnapshot,
	own: RegisteredWindow,
	projectPath: string | undefined
): ChannelError {
	const resolved = (err.details as { projectPath?: unknown } | undefined)?.projectPath;
	const target = typeof resolved === "string" ? resolved : projectPath;
	if (target === undefined || !path.isAbsolute(target)) {
		return err;
	}
	const others = otherWindowsWith(snapshot, own, target);
	const hint =
		others.length > 0
			? ` Проект открыт в другом окне: ${describeWindows(others)}. Агент работает с окном, из которого запущен: продолжите в том окне`
			: " Проект не открыт ни в одном окне VS Code или Cursor с 1C: Platform Tools";
	return new ChannelError(`${err.reason}.${hint}`, err.code, err.details);
}
