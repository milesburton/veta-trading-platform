import { logger } from "@veta/logger";

export interface TokenClientConfig {
  userServiceUrl: string;
  clientId: string;
  username: string;
  password: string;
  refreshIntervalMs?: number;
}

interface AuthorizeResponse {
  code: string;
}

interface TokenResponse {
  access_token: string;
}

const DEFAULT_REFRESH_INTERVAL_MS = 45 * 60_000;

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generateVerifier(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function deriveChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

export class TokenClient {
  #config: Required<TokenClientConfig>;
  #timer: number | undefined;

  constructor(config: TokenClientConfig) {
    this.#config = {
      refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
      ...config,
    };
  }

  async acquire(): Promise<string> {
    const { userServiceUrl, clientId, username, password } = this.#config;

    const verifier = generateVerifier();
    const challenge = await deriveChallenge(verifier);

    const authorizeRes = await fetch(`${userServiceUrl}/oauth/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        username,
        password,
        redirect_uri: "postmessage",
        response_type: "code",
        scope: "openid profile",
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
    });
    if (!authorizeRes.ok) {
      throw new Error(`oauth/authorize failed: ${authorizeRes.status} ${await authorizeRes.text()}`);
    }
    const { code } = (await authorizeRes.json()) as AuthorizeResponse;

    const tokenRes = await fetch(`${userServiceUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        code,
        grant_type: "authorization_code",
        redirect_uri: "postmessage",
        code_verifier: verifier,
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`oauth/token failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const { access_token } = (await tokenRes.json()) as TokenResponse;
    if (!access_token) {
      throw new Error("oauth/token response had no access_token");
    }
    return access_token;
  }

  start(onToken: (token: string) => void): void {
    const refresh = async () => {
      try {
        const token = await this.acquire();
        logger.info("synthetic-trader: token acquired");
        onToken(token);
      } catch (err) {
        logger.error("synthetic-trader: token acquisition failed", { err });
      }
    };
    refresh();
    this.#timer = setInterval(refresh, this.#config.refreshIntervalMs);
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }
}
