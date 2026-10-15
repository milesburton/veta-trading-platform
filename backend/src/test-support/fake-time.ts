import { vi } from "vitest";

export class FakeTime {
  constructor(start: number | Date = Date.now()) {
    vi.useFakeTimers({ now: start });
  }

  get now(): number {
    return Date.now();
  }

  tick(ms = 0): void {
    vi.advanceTimersByTime(ms);
  }

  async tickAsync(ms = 0): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
  }

  async runMicrotasks(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
  }

  restore(): void {
    vi.useRealTimers();
  }
}
