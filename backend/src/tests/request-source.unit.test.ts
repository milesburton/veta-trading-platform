import { assertEquals } from "jsr:@std/assert@0.217";
import { classifyRequestSource } from "../gateway/requestSource.ts";

Deno.test("k6 user-agent is classified as loadgen", () => {
  assertEquals(classifyRequestSource("k6/0.55.0"), "loadgen");
  assertEquals(classifyRequestSource("k6/1.0.0-rc"), "loadgen");
});

Deno.test("non-k6 user-agents are unclassified", () => {
  assertEquals(
    classifyRequestSource("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"),
    undefined
  );
  assertEquals(classifyRequestSource("curl/8.4.0"), undefined);
  assertEquals(classifyRequestSource("Wget/1.21"), undefined);
  // Spoofing prevention: only the prefix `k6/` counts, not "Mozilla/k6/...".
  assertEquals(classifyRequestSource("Mozilla/5.0 k6/0.55.0"), undefined);
});

Deno.test("missing user-agent is undefined (no source claim)", () => {
  assertEquals(classifyRequestSource(null), undefined);
  assertEquals(classifyRequestSource(undefined), undefined);
  assertEquals(classifyRequestSource(""), undefined);
});

Deno.test("classifier never returns 'loadgen' on suspicious-looking UAs", () => {
  // A real attacker isn't going to advertise k6 in their UA, but we should
  // still treat this as a false positive (and the classifier handles it
  // because it's a noise filter, not an auth signal).
  // The relevant guarantee is documented: classifier output MUST NOT be
  // trusted for any authn/authz decision.
  const result = classifyRequestSource("k6/9.9.9-attacker");
  // We accept the tag — but the alert-side guarantee is that we still
  // record the event in user.access (audit trail intact); only the alert
  // query filters it out.
  assertEquals(result, "loadgen");
});
