import { getRegion } from "./region";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const BASE = "/api";

async function handle(res: Response) {
  if (res.status === 204) return null;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error ?? { code: "Error", message: res.statusText };
    throw new ApiError(err.code, err.message, res.status);
  }
  return data;
}

function headers(extra?: Record<string, string>) {
  return {
    "x-floci-region": getRegion(),
    ...extra,
  };
}

export const api = {
  get: (path: string) =>
    fetch(`${BASE}${path}`, { headers: headers() }).then(handle),

  post: (path: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(handle),

  put: (path: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "PUT",
      headers: headers({ "Content-Type": "application/json" }),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then(handle),

  del: (path: string) =>
    fetch(`${BASE}${path}`, { method: "DELETE", headers: headers() }).then(handle),

  // multipart upload (FormData) — no JSON content-type header
  upload: (path: string, form: FormData) =>
    fetch(`${BASE}${path}`, { method: "POST", headers: headers(), body: form }).then(handle),
};
