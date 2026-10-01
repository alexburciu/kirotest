// ---------------------------------------------------------------------------
// Typed error classes
// ---------------------------------------------------------------------------

export class ApiClientError extends Error {
  readonly status: number;
  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.name = "ApiClientError";
    // Restore prototype chain for instanceof checks across compilation targets
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown for HTTP 4xx responses. */
export class ApiError4xx extends ApiClientError {
  readonly body: unknown;
  constructor(
    status: number,
    message: string,
    body: unknown,
  ) {
    super(status, message);
    this.body = body;
    this.name = "ApiError4xx";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown for HTTP 5xx responses. */
export class ApiError5xx extends ApiClientError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "ApiError5xx";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the network request itself fails (no response received). */
export class NetworkError extends ApiClientError {
  constructor(message: string) {
    super(0, message);
    this.name = "NetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Attempt a single fetch call; throws NetworkError on any fetch exception. */
async function attemptFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new NetworkError(`Network request failed: ${msg}`);
  }
}

/**
 * Execute a fetch with exponential-backoff retry on NetworkError.
 * 4xx / 5xx responses are NOT retried — they are returned as-is for the
 * caller to inspect.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
): Promise<Response> {
  let lastError: NetworkError | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await attemptFetch(url, options);
    } catch (err) {
      if (err instanceof NetworkError) {
        lastError = err;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          await sleep(delay);
          continue;
        }
      }
      throw err;
    }
  }

  // All retries exhausted
  throw lastError ?? new NetworkError("Network request failed after retries");
}

/** Parse the response body and throw the appropriate typed error. */
async function handleErrorResponse(response: Response): Promise<never> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof (body as Record<string, unknown>)["message"] === "string"
      ? (body as Record<string, unknown>)["message"]
      : response.statusText || `HTTP ${response.status}`;

  if (response.status >= 400 && response.status < 500) {
    throw new ApiError4xx(response.status, message as string, body);
  }
  throw new ApiError5xx(response.status, message as string);
}

// ---------------------------------------------------------------------------
// API client factory
// ---------------------------------------------------------------------------

export interface ApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, body?: unknown): Promise<T>;
  put<T>(url: string, body?: unknown): Promise<T>;
  del<T>(url: string): Promise<T>;
}

export function createApiClient(getToken: () => string | null): ApiClient {
  function authHeaders(includeContentType: boolean): HeadersInit {
    const token = getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token ?? ""}`,
    };
    if (includeContentType) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  async function request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<T> {
    const hasBody = body !== undefined;
    const options: RequestInit = {
      method,
      headers: authHeaders(hasBody),
      ...(hasBody ? { body: JSON.stringify(body) } : {}),
    };

    const response = await fetchWithRetry(url, options);

    if (!response.ok) {
      await handleErrorResponse(response);
    }

    // Parse JSON if there is a body; return undefined-cast-to-T for 204/205
    if (
      response.status === 204 ||
      response.status === 205 ||
      response.headers.get("content-length") === "0"
    ) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T>(url: string) => request<T>("GET", url),
    post: <T>(url: string, body?: unknown) => request<T>("POST", url, body),
    put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body),
    del: <T>(url: string) => request<T>("DELETE", url),
  };
}

// ---------------------------------------------------------------------------
// Singleton with settable token
// ---------------------------------------------------------------------------

let _authToken: string | null = null;

/** Update the token used by the singleton `apiClient`. */
export function setAuthToken(token: string | null): void {
  _authToken = token;
}

/** Pre-configured singleton. Call `setAuthToken` to inject the current token. */
export const apiClient: ApiClient = createApiClient(() => _authToken);
