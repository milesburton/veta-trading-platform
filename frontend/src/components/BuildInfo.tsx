import { actionsUrl, commitUrl } from "@veta/frontend/utils/githubLinks";

interface Props {
  buildDate?: string;
  commitSha?: string;
  version?: string;
  className?: string;
}

export function BuildInfo({ buildDate, commitSha, version, className }: Props) {
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;
  const dateOnly = buildDate ? buildDate.slice(0, 10) : null;
  if (!version && !shortSha && !dateOnly) return null;

  const commitHref = commitSha ? commitUrl(commitSha) : null;
  const actionsHref = actionsUrl();

  const tooltipBits: string[] = [];
  if (version) tooltipBits.push(`Version ${version}`);
  if (commitSha) tooltipBits.push(`Commit ${commitSha}`);
  if (buildDate) tooltipBits.push(`Built ${buildDate} UTC`);
  if (commitHref) tooltipBits.push("Click commit to view on GitHub");

  return (
    <span
      data-testid="build-info"
      title={tooltipBits.join(" · ")}
      className={className ?? "text-[10px] text-muted tabular-nums"}
    >
      {version && <span>{version}</span>}
      {version && shortSha && <span aria-hidden="true"> · </span>}
      {shortSha &&
        (commitHref ? (
          <a
            href={commitHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="build-info-commit-link"
            className="hover:text-secondary hover:underline"
            aria-label={`View commit ${commitSha} on GitHub`}
          >
            {shortSha}
          </a>
        ) : (
          <span>{shortSha}</span>
        ))}
      {(version || shortSha) && dateOnly && <span aria-hidden="true"> · </span>}
      {dateOnly &&
        (actionsHref ? (
          <a
            href={actionsHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="build-info-actions-link"
            className="hover:text-secondary hover:underline"
            aria-label="View CI runs on GitHub Actions"
          >
            {dateOnly}
          </a>
        ) : (
          <span>{dateOnly}</span>
        ))}
    </span>
  );
}
