import type { AgentConfig } from "../../config";

type VaultConfig = AgentConfig["vault"];

interface VaultErrorResponse {
  errors?: string[];
}

/** Thin Bun-native client for Vault / OpenBao KV v2 HTTP API. No extra deps. */
export class VaultClient {
  private readonly config: VaultConfig;
  private cachedToken: string | null = null;

  constructor(config: VaultConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  private async authenticate(): Promise<string> {
    const { authMethod, addr, token, roleId, secretId, k8sRole, k8sMount } =
      this.config;

    if (authMethod === "token") {
      if (!token) throw new Error("VAULT_TOKEN is not set");
      return token;
    }

    if (authMethod === "approle") {
      if (!roleId || !secretId)
        throw new Error("VAULT_ROLE_ID and VAULT_SECRET_ID must be set for AppRole auth");
      const res = await this.rawRequest<{ auth: { client_token: string } }>(
        "POST",
        `${addr}/v1/auth/approle/login`,
        null, // no token yet
        { role_id: roleId, secret_id: secretId },
      );
      return res.auth.client_token;
    }

    if (authMethod === "kubernetes") {
      if (!k8sRole)
        throw new Error("VAULT_K8S_ROLE must be set for Kubernetes auth");
      const jwt = await Bun.file(
        "/var/run/secrets/kubernetes.io/serviceaccount/token",
      ).text();
      const mount = k8sMount || "kubernetes";
      const res = await this.rawRequest<{ auth: { client_token: string } }>(
        "POST",
        `${addr}/v1/auth/${mount}/login`,
        null,
        { role: k8sRole, jwt },
      );
      return res.auth.client_token;
    }

    throw new Error(`Unknown Vault auth method: ${authMethod as string}`);
  }

  /** Returns a valid token, lazily authenticating on first call. */
  async getToken(): Promise<string> {
    if (!this.cachedToken) {
      this.cachedToken = await this.authenticate();
    }
    return this.cachedToken;
  }

  /** Invalidate cached token (called on 403 to force re-auth). */
  private invalidateToken(): void {
    this.cachedToken = null;
  }

  // ---------------------------------------------------------------------------
  // Core HTTP layer
  // ---------------------------------------------------------------------------

  private async rawRequest<T>(
    method: string,
    url: string,
    token: string | null,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers["X-Vault-Token"] = token;
    if (this.config.namespace) headers["X-Vault-Namespace"] = this.config.namespace;

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return null as T;

    const json = await res.json().catch(() => ({})) as VaultErrorResponse;

    if (!res.ok) {
      const msgs = json.errors?.join("; ") ?? res.statusText;
      const err = new Error(`Vault ${method} ${url} → ${res.status}: ${msgs}`);
      (err as Error & { status: number }).status = res.status;
      throw err;
    }

    return json as T;
  }

  /**
   * Authenticated request with one automatic re-auth retry on 403.
   * Builds the full URL from config.addr + relative path.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.addr}/v1/${path}`;
    let token = await this.getToken();

    try {
      return await this.rawRequest<T>(method, url, token, body);
    } catch (err) {
      if ((err as Error & { status?: number }).status === 403) {
        // Token may have expired — re-authenticate once and retry
        this.invalidateToken();
        token = await this.getToken();
        return await this.rawRequest<T>(method, url, token, body);
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // KV v2 operations
  // ---------------------------------------------------------------------------

  /**
   * Read a KV v2 secret. Returns the full key/value map stored at the path.
   * @param path  Secret path relative to the mount (e.g. "myapp/db")
   * @param mount KV v2 mount point (default: config.defaultMount)
   */
  async kvRead(
    path: string,
    mount?: string,
  ): Promise<Record<string, string>> {
    const m = mount ?? this.config.defaultMount;
    const res = await this.request<{
      data: { data: Record<string, string> };
    }>("GET", `${m}/data/${path}`);
    return res.data.data;
  }

  /**
   * Write (create or update) a KV v2 secret.
   * @param path  Secret path relative to the mount
   * @param data  Key/value pairs to store
   * @param mount KV v2 mount point (default: config.defaultMount)
   * @returns Version number of the written secret
   */
  async kvWrite(
    path: string,
    data: Record<string, string>,
    mount?: string,
  ): Promise<number> {
    const m = mount ?? this.config.defaultMount;
    const res = await this.request<{
      data: { version: number };
    }>("POST", `${m}/data/${path}`, { data });
    return res.data.version;
  }

  /**
   * List secret paths at a given prefix (KV v2 metadata endpoint).
   * Keys ending in "/" are sub-folders.
   * @param path  Directory prefix (e.g. "myapp/")
   * @param mount KV v2 mount point (default: config.defaultMount)
   */
  async kvList(path: string, mount?: string): Promise<string[]> {
    const m = mount ?? this.config.defaultMount;
    const p = path.endsWith("/") ? path.slice(0, -1) : path;
    const res = await this.request<{
      data: { keys: string[] };
    }>("LIST", `${m}/metadata/${p}`);
    return res.data.keys;
  }
}
