/**
 * Схемы параметров инструментов: набор полей зависит от команды.
 *
 * Единая схема на все инструменты давала агенту одиннадцать параметров даже
 * там, где применим один: sha у прогона тестов, frameworks у сборки. Лишние
 * поля не только занимают контекст, но и провоцируют неверные вызовы.
 */
import { z } from "zod";

/** Параметры, общие для всех инструментов. */
const commonShape = {
	projectPath: z
		.string()
		.optional()
		.describe(
			"Корень проекта 1С: каталог с packagedef или env.json. " +
			"Можно не передавать, если в VS Code открыт один проект"
		),
	wait: z
		.boolean()
		.optional()
		.default(true)
		.describe(
			"Ждать завершения операции и вернуть результат: успех, вывод, сводку тестов. " +
			"По умолчанию true. wait: false запускает команду в терминале VS Code и " +
			"возвращает управление сразу, исход остаётся неизвестен."
		),
} as const;

/** Настройки прогона: применимы к командам, которые запускают vanessa-runner. */
const settingsShape = {
	settingsFile: z
		.string()
		.optional()
		.describe("Путь к файлу настроек vanessa-runner относительно projectPath. По умолчанию: env.json"),
	ibConnection: z
		.string()
		.optional()
		.describe("Явная строка подключения к ИБ. Если не задана, берётся из настроек проекта"),
} as const;

/** Переопределение каталогов проекта: команды, работающие с исходниками и сборкой. */
const pathsShape = {
	pathsOverride: z
		.object({
			cf: z.string().optional(),
			out: z.string().optional(),
			cfe: z.string().optional(),
			epf: z.string().optional(),
			erf: z.string().optional(),
		})
		.optional()
		.describe("Переопределение каталогов src/cf, build/out, src/cfe, src/epf, src/erf относительно projectPath"),
} as const;

const shaShape = {
	sha: z
		.string()
		.describe("SHA коммита для инкрементальной загрузки. Пустая строка — полная загрузка"),
} as const;

const extensionsShape = {
	extensions: z
		.array(z.string())
		.optional()
		.describe("Имена расширений конфигурации. Без параметра берётся сохранённый выбор проекта"),
} as const;

const profileShape = {
	profile: z
		.string()
		.optional()
		.describe("Профиль запуска: идентификатор (dev), имя файла настроек (env.dev.json) или подпись"),
} as const;

const frameworksShape = {
	frameworks: z
		.array(z.string())
		.optional()
		.describe(
			"Включаемые тестовые фреймворки: vanessa, xunit, yaxunit, onescript, onebdd. " +
			"Остальные выключаются"
		),
} as const;

const enterpriseShape = {
	execute: z
		.string()
		.optional()
		.describe("Путь к внешней обработке или отчёту (.epf, .erf) для запуска в Предприятии"),
	command: z
		.string()
		.optional()
		.describe("Строка параметров запуска /C для внешней обработки"),
} as const;

/** Управление сеансами: параметры разового вызова, подключение берётся из профиля. */
const sessionShape = {
	lockMessage: z
		.string()
		.optional()
		.describe("Сообщение пользователю при попытке начать сеанс в заблокированной базе"),
	accessCode: z
		.string()
		.optional()
		.describe("Код допуска: с ним можно войти в базу, где начало сеансов запрещено"),
	lockStart: z
		.string()
		.optional()
		.describe("Время начала блокировки, например 2040-12-31T23:59:59 (только vanessa-runner 2.x)"),
	lockEnd: z
		.string()
		.optional()
		.describe("Время окончания блокировки (только vanessa-runner 2.x)"),
} as const;

/** Отбор сеансов: общий для завершения, проверки отсутствия и списка. */
const sessionFilterShape = {
	sessionFilter: z
		.string()
		.optional()
		.describe("Отбор сеансов, например appid=Designer|name=Администратор; значения через точку с запятой"),
	sessionFilterMode: z
		.string()
		.optional()
		.describe("Режим отбора: ONLY, OFF, EXCEPT; DEFAULT и ALL - только vanessa-runner 2.x"),
} as const;

/** Завершение сеансов: блокировка и ожидание завершения. */
const sessionKillShape = {
	...sessionFilterShape,
	keepSessionsUnlocked: z
		.boolean()
		.optional()
		.describe("Не запрещать начало новых сеансов при их завершении"),
	sessionRetry: z
		.number()
		.optional()
		.describe("Число попыток добить зависшие сеансы, по умолчанию 3 (только vanessa-runner 3.x)"),
	sessionTimeout: z
		.number()
		.optional()
		.describe("Ожидание завершения сеансов в секундах; при нём число попыток не используется (только vanessa-runner 3.x)"),
} as const;

/** Проверка отсутствия сеансов: отбор и ожидание. */
const sessionClosedShape = {
	...sessionFilterShape,
	sessionTimeout: z
		.number()
		.optional()
		.describe("Ждать освобождения базы столько секунд, проверяя каждые 3 секунды (только vanessa-runner 3.x)"),
} as const;

/** Список сеансов: отбор и вывод соединений. */
const sessionListShape = {
	...sessionFilterShape,
	sessionConnections: z
		.boolean()
		.optional()
		.describe("Дополнительно показать соединения информационной базы, включая зависшие без сеанса"),
} as const;

/** Запуск цепочки шагов из .1cpt/pipelines.json. */
const pipelineShape = {
	pipeline: z
		.string()
		.describe(
			"Идентификатор или название цепочки из .1cpt/pipelines.json. " +
			"Без него команда не выполняется: выбирать цепочку за пользователя нельзя"
		),
} as const;

/** Команды, которым не нужны настройки vanessa-runner. */
const WITHOUT_SETTINGS = [
	"1c-platform-tools.env.",
	"1c-platform-tools.launch.",
	"1c-platform-tools.testing.",
	"1c-platform-tools.dependencies.",
	"1c-platform-tools.oscript.",
	"1c-platform-tools.components.",
	"1c-platform-tools.pipelines.",
];

/** Команды, которым нужны каталоги проекта. */
const WITH_PATHS = [
	"1c-platform-tools.configuration.",
	"1c-platform-tools.build.",
	"1c-platform-tools.decompile.",
	"1c-platform-tools.extensions.",
	"1c-platform-tools.externalProcessors.",
	"1c-platform-tools.externalReports.",
	"1c-platform-tools.externalFiles.",
	"1c-platform-tools.test.",
	"1c-platform-tools.infobase.",
];

/** Схема параметров инструмента: общие поля плюс применимые к команде. */
export type ToolParamsShape = Record<string, z.ZodTypeAny>;

/**
 * Собирает схему параметров под конкретную команду расширения.
 *
 * @param commandId — идентификатор команды (1c-platform-tools.test.runXUnit)
 * @returns поля схемы инструмента
 */
export function paramsForCommand(commandId: string): ToolParamsShape {
	const shape: ToolParamsShape = { ...commonShape };

	if (!WITHOUT_SETTINGS.some((prefix) => commandId.startsWith(prefix))) {
		Object.assign(shape, settingsShape);
	}
	if (WITH_PATHS.some((prefix) => commandId.startsWith(prefix))) {
		Object.assign(shape, pathsShape);
	}
	if (commandId === "1c-platform-tools.configuration.loadIncrementFromSrc") {
		Object.assign(shape, shaShape);
	}
	if (commandId.startsWith("1c-platform-tools.extensions.")) {
		Object.assign(shape, extensionsShape);
	}
	if (commandId === "1c-platform-tools.env.selectProfile") {
		Object.assign(shape, profileShape);
	}
	if (commandId === "1c-platform-tools.test.configure") {
		Object.assign(shape, frameworksShape);
	}
	if (commandId === "1c-platform-tools.run.enterprise") {
		Object.assign(shape, enterpriseShape);
	}
	if (commandId.startsWith("1c-platform-tools.session.")) {
		Object.assign(shape, sessionShape);
	}
	if (commandId === "1c-platform-tools.session.kill") {
		Object.assign(shape, sessionKillShape);
	}
	if (commandId === "1c-platform-tools.session.checkClosed") {
		Object.assign(shape, sessionClosedShape);
	}
	if (commandId === "1c-platform-tools.session.list") {
		Object.assign(shape, sessionListShape);
	}
	if (commandId === "1c-platform-tools.pipelines.run") {
		Object.assign(shape, pipelineShape);
	}

	return shape;
}
