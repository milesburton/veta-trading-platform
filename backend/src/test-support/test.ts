import { test as vitestTest } from "vitest";

export interface TestContext {
  name: string;
  step(name: string, fn: (t: TestContext) => unknown): Promise<boolean>;
  step(definition: {
    name: string;
    fn: (t: TestContext) => unknown;
    ignore?: boolean;
  }): Promise<boolean>;
}

type TestFn = (t: TestContext) => unknown;

function createContext(name: string): TestContext {
  const step = async (
    nameOrDefinition: string | { name: string; fn: TestFn; ignore?: boolean },
    maybeFn?: TestFn
  ): Promise<boolean> => {
    const definition =
      typeof nameOrDefinition === "string"
        ? { name: nameOrDefinition, fn: maybeFn as TestFn, ignore: false }
        : nameOrDefinition;
    if (definition.ignore) return false;
    try {
      await definition.fn(createContext(definition.name));
      return true;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`step "${definition.name}" failed: ${detail}`, { cause });
    }
  };
  return { name, step } as TestContext;
}

interface TestDefinition {
  name: string;
  fn: TestFn;
  ignore?: boolean;
  only?: boolean;
  sanitizeOps?: boolean;
  sanitizeResources?: boolean;
  sanitizeExit?: boolean;
}

export function test(name: string, fn: TestFn): void;
export function test(definition: TestDefinition): void;
export function test(nameOrDefinition: string | TestDefinition, maybeFn?: TestFn): void {
  const definition =
    typeof nameOrDefinition === "string"
      ? { name: nameOrDefinition, fn: maybeFn as TestFn }
      : nameOrDefinition;
  const runner = definition.ignore
    ? vitestTest.skip
    : definition.only
      ? vitestTest.only
      : vitestTest;
  runner(definition.name, async () => {
    await definition.fn(createContext(definition.name));
  });
}
