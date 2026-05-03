interface Props {
  buildDate?: string;
  commitSha?: string;
  className?: string;
}

export function BuildInfo({ buildDate, commitSha, className }: Props) {
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;
  const parts: string[] = [];
  if (shortSha) parts.push(`v${shortSha}`);
  if (buildDate) parts.push(buildDate);
  if (parts.length === 0) return null;

  return (
    <span
      data-testid="build-info"
      title={commitSha ? `Build ${commitSha}${buildDate ? ` (${buildDate})` : ""}` : undefined}
      className={className ?? "text-[10px] text-gray-500 tabular-nums"}
    >
      {parts.join(" · ")}
    </span>
  );
}
