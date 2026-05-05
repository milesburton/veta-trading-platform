interface Props {
  buildDate?: string;
  commitSha?: string;
  env?: string;
  className?: string;
}

const ENV_TAG_CLASS: Record<string, string> = {
  local: "text-sky-400",
  uat: "text-amber-300",
  fly: "text-emerald-300",
};

export function BuildInfo({ buildDate, commitSha, env, className }: Props) {
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;
  const parts: string[] = [];
  if (shortSha) parts.push(`v${shortSha}`);
  if (buildDate) parts.push(buildDate);
  if (parts.length === 0 && !env) return null;

  const envLabel = env === "fly" ? "demo" : env;
  const envCls = env ? (ENV_TAG_CLASS[env] ?? "text-gray-400") : "";

  return (
    <span
      data-testid="build-info"
      title={commitSha ? `Build ${commitSha}${buildDate ? ` (${buildDate})` : ""}` : undefined}
      className={className ?? "text-[10px] text-gray-500 tabular-nums"}
    >
      {envLabel && (
        <span data-testid="build-info-env" className={`${envCls} font-semibold uppercase mr-1.5`}>
          {envLabel}
        </span>
      )}
      {parts.join(" · ")}
    </span>
  );
}
