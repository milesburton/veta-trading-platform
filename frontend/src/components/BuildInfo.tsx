interface Props {
  buildDate?: string;
  commitSha?: string;
  version?: string;
  className?: string;
}

export function BuildInfo({ buildDate, commitSha, version, className }: Props) {
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;
  const dateOnly = buildDate ? buildDate.slice(0, 10) : null;
  const parts: string[] = [];
  if (version) parts.push(version);
  if (shortSha) parts.push(shortSha);
  if (dateOnly) parts.push(dateOnly);
  if (parts.length === 0) return null;

  const tooltipBits: string[] = [];
  if (version) tooltipBits.push(`Version ${version}`);
  if (commitSha) tooltipBits.push(`Build ${commitSha}`);
  if (buildDate) tooltipBits.push(`(${buildDate})`);

  return (
    <span
      data-testid="build-info"
      title={tooltipBits.join(" ") || undefined}
      className={className ?? "text-[10px] text-muted tabular-nums"}
    >
      {parts.join(" · ")}
    </span>
  );
}
