const TOKEN_KEY = "sc_auth_token";
const ROLE_KEY = "sc_auth_role";

export type AuthRole = "admin" | "user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? localStorage.getItem("sc_admin_token");
}

export function getRole(): AuthRole | null {
  const r = localStorage.getItem(ROLE_KEY);
  if (r === "admin" || r === "user") return r;
  return getToken() ? "admin" : null;
}

export function setSession(token: string | null, role?: AuthRole | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem("sc_admin_token");
    if (role) localStorage.setItem(ROLE_KEY, role);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem("sc_admin_token");
  }
}

/** @deprecated use setSession */
export function setToken(token: string | null) {
  setSession(token, token ? getRole() : null);
}

async function request<T = unknown>(
  base: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${base}${path}`, { ...options, headers });
  if (
    res.status === 401 &&
    !path.includes("/login") &&
    !path.includes("/register") &&
    !path.includes("/captcha") &&
    !path.includes("/forgot-password")
  ) {
    setSession(null);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message ||
            (typeof data.error === "object" ? JSON.stringify(data.error) : null) ||
            res.statusText ||
            "Request failed",
    );
  }
  return data as T;
}

export function api<T = unknown>(path: string, options: RequestInit = {}) {
  return request<T>("/api/admin", path, options);
}

export function authApi<T = unknown>(path: string, options: RequestInit = {}) {
  return request<T>("/api/auth", path, options);
}

export function portalApi<T = unknown>(path: string, options: RequestInit = {}) {
  return request<T>("/api/portal", path, options);
}

export async function apiDownload(path: string, fallbackName: string) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`/api/admin${path}`, { headers });
  if (res.status === 401) {
    setSession(null);
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message || res.statusText || "下载失败",
    );
  }
  const blob = await res.blob();
  const dispo = res.headers.get("Content-Disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?["']?([^";]+)/i.exec(dispo);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatTokens(n: number): string {
  if (n < 0) return "∞";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}
