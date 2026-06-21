export const scenariosSchema = [
  {
    name: "scenarios.scenarios",
    label: "Saved scenarios",
    description: "One row per saved scenario. Owned by a user via `users.users(id)` cascade. Unique on `(user_id, name)`.",
    columns: [
      { name: "id", type: "uuid", flags: "PK", description: "Primary key", nullable: "NO" },
      { name: "user_id", type: "uuid", flags: "FK, NOT NULL", description: "Owner (cascade to users.users)", nullable: "NO" },
      { name: "name", type: "text", flags: "NOT NULL, UK", description: "Scenario name (unique per user)", nullable: "NO" },
      { name: "description", type: "text", flags: "", description: "Optional description", nullable: "YES" },
      { name: "spec", type: "jsonb", flags: "JSONB, NOT NULL", description: "Trade spec: seed, symbol, side, quantity, limitPrice, strategy, algoParams, durationMs", nullable: "NO" },
      { name: "expected", type: "jsonb", flags: "JSONB", description: "Expected outcomes with tolerances (all optional)", nullable: "YES" },
      { name: "created_at", type: "timestamptz", flags: "NOT NULL", description: "Row creation time", nullable: "NO" },
      { name: "updated_at", type: "timestamptz", flags: "NOT NULL", description: "Last update time", nullable: "NO" },
    ],
  },
  {
    name: "scenarios.runs",
    label: "Run executions",
    description: "One row per execution. Append-only. Linked to the scenario and the parent order in the journal.",
    columns: [
      { name: "id", type: "uuid", flags: "PK", description: "Primary key", nullable: "NO" },
      { name: "scenario_id", type: "uuid", flags: "FK, NOT NULL", description: "Parent scenario (cascade)", nullable: "NO" },
      { name: "user_id", type: "uuid", flags: "FK, NOT NULL", description: "User who triggered the run", nullable: "NO" },
      { name: "triggered_at", type: "timestamptz", flags: "NOT NULL", description: "When the run started", nullable: "NO" },
      { name: "completed_at", type: "timestamptz", flags: "", description: "When the run finished (null if still running)", nullable: "YES" },
      { name: "parent_order_id", type: "uuid", flags: "FK", description: "Parent order in journal (null if submit failed)", nullable: "YES" },
      { name: "actual", type: "jsonb", flags: "JSONB", description: "Actual outcome: fillCount, totalFilled, avgFillPriceBps, slippageBps", nullable: "YES" },
      { name: "diff", type: "jsonb", flags: "JSONB", description: "Diff against expected outcomes", nullable: "YES" },
      { name: "status", type: "text", flags: "NOT NULL", description: "completed | mismatched | failed", nullable: "NO" },
      { name: "error", type: "text", flags: "", description: "Error message if failed", nullable: "YES" },
    ],
  },
];
