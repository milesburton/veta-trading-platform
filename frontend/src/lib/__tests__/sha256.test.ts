import { describe, expect, it } from "vitest";
import { sha256, sha256Async } from "../sha256";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("sha256", () => {
  it("matches known empty-input hash", () => {
    const out = sha256(new Uint8Array(0));
    expect(toHex(out)).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches known abc hash", () => {
    const out = sha256(new TextEncoder().encode("abc"));
    expect(toHex(out)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches a 56-byte boundary input (forces 2-block padding)", () => {
    const out = sha256(
      new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
    );
    expect(toHex(out)).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("handles 1MB input without overflow", () => {
    const data = new Uint8Array(1024 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = i & 0xff;
    const out = sha256(data);
    expect(out.length).toBe(32);
  });
});

describe("sha256Async", () => {
  it("returns 32 bytes for any input", async () => {
    const out = await sha256Async(new TextEncoder().encode("hello"));
    expect(out.length).toBe(32);
  });

  it("matches the synchronous implementation when WebCrypto is available", async () => {
    const data = new TextEncoder().encode("PKCE verifier sample");
    const fromAsync = await sha256Async(data);
    const fromSync = sha256(data);
    expect(toHex(fromAsync)).toBe(toHex(fromSync));
  });

  it("falls back to JS implementation when crypto.subtle is unavailable", async () => {
    const realDigest = globalThis.crypto.subtle.digest;
    // Override digest to undefined via property descriptor
    Object.defineProperty(globalThis.crypto.subtle, "digest", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      const out = await sha256Async(new TextEncoder().encode("abc"));
      expect(toHex(out)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    } finally {
      Object.defineProperty(globalThis.crypto.subtle, "digest", {
        value: realDigest,
        configurable: true,
        writable: true,
      });
    }
  });
});
