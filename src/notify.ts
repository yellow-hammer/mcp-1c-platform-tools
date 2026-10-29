/**
 * Уведомления без всплывающих окон.
 *
 * Рутинное подтверждение («конфиг записан») показывается в строке состояния
 * и само исчезает, след остаётся в журнале. Окно — для ошибки, предупреждения
 * и сообщения с кнопкой.
 */
import * as vscode from "vscode";
import { logger } from "./logger.js";

/** Сколько держать сообщение в строке состояния. */
const STATUS_TIMEOUT_MS = 4_000;

/**
 * Сообщает об успешном рутинном действии.
 *
 * @param message — что произошло
 */
export function notifyQuiet(message: string): void {
	logger.info(message);
	vscode.window.setStatusBarMessage(`$(check) ${message}`, STATUS_TIMEOUT_MS);
}
