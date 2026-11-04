import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { test } from "#veta/test";
import { assert } from "#veta/test-assert";

const ROOT = new URL("../../../", import.meta.url);
const RUNBOOK_BASE =
  "https://github.com/milesburton/veta-trading-platform/blob/main/docs/incidents/runbooks/";

const RULE_FILES = [
  "observability/prometheus-rules.yml",
  "observability/grafana/provisioning/alerting/host.yml",
  "observability/grafana/provisioning/alerting/security.yml",
];

interface Rule {
  name: string;
  runbookUrl: string | undefined;
}

interface RawRule {
  alert?: string;
  title?: string;
  annotations?: { runbook_url?: string };
}

function rulesIn(file: string): Rule[] {
  const doc = parse(readFileSync(new URL(file, ROOT), "utf8")) as {
    groups?: { rules?: RawRule[] }[];
  };
  return (doc.groups ?? []).flatMap((group) =>
    (group.rules ?? []).map((rule) => ({
      name: `${file}: ${rule.alert ?? rule.title ?? "unnamed"}`,
      runbookUrl: rule.annotations?.runbook_url,
    }))
  );
}

test("[alert-runbooks] every Prometheus and Grafana alert links an existing runbook", () => {
  const rules = RULE_FILES.flatMap(rulesIn);
  assert(rules.length > 0, "no alert rules found");
  const problems = rules.flatMap(({ name, runbookUrl }) => {
    if (!runbookUrl) return [`${name} has no runbook_url`];
    if (!runbookUrl.startsWith(RUNBOOK_BASE)) return [`${name} runbook_url is outside the base`];
    const file = runbookUrl.slice(RUNBOOK_BASE.length);
    return existsSync(new URL(`docs/incidents/runbooks/${file}`, ROOT))
      ? []
      : [`${name} points at missing runbook ${file}`];
  });
  assert(problems.length === 0, problems.join("\n"));
});
