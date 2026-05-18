function repoUrl(): string {
  return (import.meta.env.VITE_GITHUB_REPO_URL as string | undefined) ?? "";
}

export function githubRepoUrl(): string | null {
  return repoUrl() || null;
}

export function commitUrl(sha: string): string | null {
  const url = repoUrl();
  if (!url || !sha || sha === "dev") return null;
  return `${url}/commit/${sha}`;
}

export function actionsUrl(): string | null {
  const url = repoUrl();
  if (!url) return null;
  return `${url}/actions`;
}

export function isShortSha(s: string): boolean {
  return /^[0-9a-f]{7,40}$/.test(s);
}
