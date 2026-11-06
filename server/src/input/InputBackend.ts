/**
 * AEROKIN Input Safety & Injection Subsystem
 *
 * S3 SAFETY CONTRACT:
 * Real mouse and keyboard input injection (SendInput, mouse_event, keybd_event,
 * SetCursorPos) can simulate dangerous user input on the host desktop.
 *
 * The real implementation can ONLY be constructed when running as a normal server.
 * Under Vitest, NODE_ENV=test, or CI, the real implementation throws immediately upon construction.
 * Automated tests and manual checks must use a RecordingInputBackend or NoOpInputBackend.
 */

import { mouse, keyboard, Button, Key, Point as NutPoint } from '@nut-tree-fork/nut-js';
import { Win32Input, Point } from '../native/win32.js';
import { isTestOrCiEnvironment } from '../actions/PowerActionExecutor.js';
import { serverLogger } from '../logger.js';

export interface RecordedInputEvent {
  type: string;
  args: any[];
  timestamp: number;
}

export interface InputBackend {
  isSupported(): boolean;
  getCursorPosition(): Point | null;
  moveRelative(dx: number, dy: number): boolean;
  setCursorPosition(x: number, y: number): boolean;
  moveAbsolute(virtualNormX: number, virtualNormY: number, screenX?: number, screenY?: number): boolean;
  click(button: 'left' | 'right' | 'middle'): boolean;
  clickAbsolute(
    button: 'left' | 'right' | 'middle',
    virtualNormX?: number,
    virtualNormY?: number,
    screenX?: number,
    screenY?: number,
    count?: number
  ): Promise<boolean>;
  mouseButton(button: 'left' | 'right' | 'middle', state: 'down' | 'up'): boolean;
  buttonAbsolute(
    button: 'left' | 'right' | 'middle',
    state: 'down' | 'up',
    virtualNormX?: number,
    virtualNormY?: number,
    screenX?: number,
    screenY?: number
  ): boolean;
  scroll(wheelDy: number, wheelDx: number): boolean;
  key(keyName: string, state: 'down' | 'up' | 'tap'): Promise<boolean>;
  keyWithModifiers(key: string, action: 'down' | 'up' | 'tap', modifiers: string[]): Promise<boolean>;
  keyCombo(combo: string): Promise<boolean>;
  sendUnicodeChar(char: string): Promise<boolean>;
  typeText(text: string): Promise<boolean>;
}

/**
 * Real OS input injection backend.
 * STRICTLY FORBIDDEN from being constructed in test or CI environment.
 */
export class RealInputBackend implements InputBackend {
  constructor() {
    if (isTestOrCiEnvironment()) {
      throw new Error(
        'FATAL: RealInputBackend cannot be constructed under vitest / test / CI environment.'
      );
    }
  }

  public isSupported(): boolean {
    return Win32Input.isSupported();
  }

  public getCursorPosition(): Point | null {
    return Win32Input.getCursorPosition();
  }

  public moveRelative(dx: number, dy: number): boolean {
    return Win32Input.moveRelative(dx, dy);
  }

  public setCursorPosition(x: number, y: number): boolean {
    return Win32Input.setCursorPosition(x, y);
  }

  public moveAbsolute(
    virtualNormX: number,
    virtualNormY: number,
    screenX?: number,
    screenY?: number
  ): boolean {
    return Win32Input.moveAbsolute(virtualNormX, virtualNormY, screenX, screenY);
  }

  public click(button: 'left' | 'right' | 'middle'): boolean {
    return Win32Input.click(button);
  }

  public async clickAbsolute(
    button: 'left' | 'right' | 'middle',
    virtualNormX?: number,
    virtualNormY?: number,
    screenX?: number,
    screenY?: number,
    count: number = 1
  ): Promise<boolean> {
    return Win32Input.clickAbsolute(button, virtualNormX, virtualNormY, screenX, screenY, count);
  }

  public mouseButton(button: 'left' | 'right' | 'middle', state: 'down' | 'up'): boolean {
    return Win32Input.mouseButton(button, state);
  }

  public buttonAbsolute(
    button: 'left' | 'right' | 'middle',
    state: 'down' | 'up',
    virtualNormX?: number,
    virtualNormY?: number,
    screenX?: number,
    screenY?: number
  ): boolean {
    return Win32Input.buttonAbsolute(button, state, virtualNormX, virtualNormY, screenX, screenY);
  }

  public scroll(wheelDy: number, wheelDx: number): boolean {
    return Win32Input.scroll(wheelDy, wheelDx);
  }

  public async key(keyName: string, state: 'down' | 'up' | 'tap'): Promise<boolean> {
    return Win32Input.key(keyName, state);
  }

  public async keyWithModifiers(key: string, action: 'down' | 'up' | 'tap', modifiers: string[]): Promise<boolean> {
    return Win32Input.keyWithModifiers(key, action, modifiers);
  }

  public async keyCombo(combo: string): Promise<boolean> {
    return Win32Input.keyCombo(combo);
  }

  public async sendUnicodeChar(char: string): Promise<boolean> {
    return Win32Input.sendUnicodeChar(char);
  }

  public async typeText(text: string): Promise<boolean> {
    for (const char of text) {
      await Win32Input.sendUnicodeChar(char);
    }
    return true;
  }
}

/**
 * No-Op input backend. Safely ignores all input operations.
 */
export class NoOpInputBackend implements InputBackend {
  public isSupported(): boolean {
    return true;
  }

  public getCursorPosition(): Point | null {
    return { x: 0, y: 0 };
  }

  public moveRelative(_dx: number, _dy: number): boolean {
    return true;
  }

  public setCursorPosition(_x: number, _y: number): boolean {
    return true;
  }

  public moveAbsolute(
    _virtualNormX: number,
    _virtualNormY: number,
    _screenX?: number,
    _screenY?: number
  ): boolean {
    return true;
  }

  public click(_button: 'left' | 'right' | 'middle'): boolean {
    return true;
  }

  public async clickAbsolute(
    _button: 'left' | 'right' | 'middle',
    _virtualNormX?: number,
    _virtualNormY?: number,
    _screenX?: number,
    _screenY?: number,
    _count: number = 1
  ): Promise<boolean> {
    return true;
  }

  public mouseButton(_button: 'left' | 'right' | 'middle', _state: 'down' | 'up'): boolean {
    return true;
  }

  public buttonAbsolute(
    _button: 'left' | 'right' | 'middle',
    _state: 'down' | 'up',
    _virtualNormX?: number,
    _virtualNormY?: number,
    _screenX?: number,
    _screenY?: number
  ): boolean {
    return true;
  }

  public scroll(_wheelDy: number, _wheelDx: number): boolean {
    return true;
  }

  public async key(_keyName: string, _state: 'down' | 'up' | 'tap'): Promise<boolean> {
    return true;
  }

  public async keyWithModifiers(
    _key: string,
    _action: 'down' | 'up' | 'tap',
    _modifiers: string[]
  ): Promise<boolean> {
    return true;
  }

  public async keyCombo(_combo: string): Promise<boolean> {
    return true;
  }

  public async sendUnicodeChar(_char: string): Promise<boolean> {
    return true;
  }

  public async typeText(_text: string): Promise<boolean> {
    return true;
  }
}

/**
 * Recording fake input backend for testing and manual validation.
 */
export class RecordingInputBackend implements InputBackend {
  public events: RecordedInputEvent[] = [];
  public currentPosition: Point = { x: 500, y: 500 };
  public supported: boolean = true;

  public record(type: string, ...args: any[]): void {
    this.events.push({
      type,
      args,
      timestamp: Date.now(),
    });
  }

  public clear(): void {
    this.events = [];
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public getCursorPosition(): Point | null {
    return { ...this.currentPosition };
  }

  public moveRelative(dx: number, dy: number): boolean {
    this.record('moveRelative', dx, dy);
    this.currentPosition.x += dx;
    this.currentPosition.y += dy;
    return true;
  }

  public setCursorPosition(x: number, y: number): boolean {
    this.record('setCursorPosition', x, y);
    this.currentPosition.x = x;
    this.currentPosition.y = y;
    return true;
  }

  public moveAbsolute(
    virtualNormX: number,
    virtualNormY: number,
    screenX?: number,
    screenY?: number
  ): boolean {
    this.record('moveAbsolute', virtualNormX, virtualNormY, screenX, screenY);
    if (screenX !== undefined && screenY !== undefined) {
      this.currentPosition.x = screenX;
      this.currentPosition.y = screenY;
    }
    return true;
  }

  public click(button: 'left' | 'right' | 'middle'): boolean {
    this.record('click', button);
    return true;
  }

  public async clickAbsolute(
    button: 'left' | 'right' | 'middle',
    virtualNormX?: number,
    virtualNormY?: number,
    screenX?: number,
    screenY?: number,
    count: number = 1
  ): Promise<boolean> {
    this.record('clickAbsolute', button, virtualNormX, virtualNormY, screenX, screenY, count);
    return true;
  }

  public mouseButton(button: 'left' | 'right' | 'middle', state: 'down' | 'up'): boolean {
    this.record('mouseButton', button, state);
    return true;
  }

  public buttonAbsolute(
    button: 'left' | 'right' | 'middle',
    state: 'down' | 'up',
    virtualNormX?: number,
    virtualNormY?: number,
    screenX?: number,
    screenY?: number
  ): boolean {
    this.record('buttonAbsolute', button, state, virtualNormX, virtualNormY, screenX, screenY);
    return true;
  }

  public scroll(wheelDy: number, wheelDx: number): boolean {
    this.record('scroll', wheelDy, wheelDx);
    return true;
  }

  public async key(keyName: string, state: 'down' | 'up' | 'tap'): Promise<boolean> {
    this.record('key', keyName, state);
    return true;
  }

  public async keyWithModifiers(
    key: string,
    action: 'down' | 'up' | 'tap',
    modifiers: string[]
  ): Promise<boolean> {
    this.record('keyWithModifiers', key, action, modifiers);
    return true;
  }

  public async keyCombo(combo: string): Promise<boolean> {
    this.record('keyCombo', combo);
    return true;
  }

  public async sendUnicodeChar(char: string): Promise<boolean> {
    this.record('sendUnicodeChar', char);
    return true;
  }

  public async typeText(text: string): Promise<boolean> {
    this.record('typeText', text);
    return true;
  }
}

/**
 * Creates the default InputBackend based on runtime environment.
 */
export function createInputBackend(): InputBackend {
  if (isTestOrCiEnvironment()) {
    return new RecordingInputBackend();
  }
  return new RealInputBackend();
}
