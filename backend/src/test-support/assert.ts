import { expect } from "vitest";

export function assert(condition: unknown, message?: string): asserts condition {
  expect(Boolean(condition), message).toBe(true);
}

export function assertEquals<T>(actual: unknown, expected: T, message?: string): void {
  expect(actual, message).toEqual(expected);
}

export function assertNotEquals(actual: unknown, expected: unknown, message?: string): void {
  expect(actual, message).not.toEqual(expected);
}

export function assertStrictEquals<T>(actual: unknown, expected: T, message?: string): void {
  expect(actual, message).toBe(expected);
}

export function assertExists<T>(actual: T, message?: string): asserts actual is NonNullable<T> {
  expect(actual, message).not.toBeNull();
  expect(actual, message).not.toBeUndefined();
}

export function assertAlmostEquals(
  actual: number,
  expected: number,
  tolerance = 1e-7,
  message?: string
): void {
  expect(Math.abs(actual - expected), message).toBeLessThanOrEqual(tolerance);
}

export function assertStringIncludes(actual: string, expected: string, message?: string): void {
  expect(actual, message).toContain(expected);
}

export function assertMatch(actual: string, expected: RegExp, message?: string): void {
  expect(actual, message).toMatch(expected);
}

export function assertGreater(actual: number, expected: number, message?: string): void {
  expect(actual, message).toBeGreaterThan(expected);
}

export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass?: new (...args: never[]) => Error,
  msgIncludes?: string
): Promise<void> {
  const assertion = expect(fn()).rejects;
  if (errorClass) await assertion.toBeInstanceOf(errorClass);
  else await assertion.toBeDefined();
  if (msgIncludes) await assertion.toThrow(msgIncludes);
}

export function assertThrows(
  fn: () => unknown,
  errorClass?: new (...args: never[]) => Error,
  msgIncludes?: string
): void {
  const assertion = expect(fn);
  if (errorClass) assertion.toThrow(errorClass);
  else assertion.toThrow();
  if (msgIncludes) assertion.toThrow(msgIncludes);
}
