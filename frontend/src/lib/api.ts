export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const pageUrl = new URL(window.location.href);
  const headers = new Headers(options.headers);
  if (pageUrl.username && !headers.has("Authorization")) {
    headers.set(
      "Authorization",
      `Basic ${btoa(`${pageUrl.username}:${pageUrl.password}`)}`,
    );
  }
  pageUrl.username = "";
  pageUrl.password = "";
  const requestUrl = new URL(path, pageUrl);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(requestUrl, {
    ...options,
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = (await response.json()) as { detail?: string };
      message = payload.detail ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function humanize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
