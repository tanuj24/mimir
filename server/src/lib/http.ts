import type { NextFunction, Request, Response, RequestHandler } from "express";

/** The UI region selector sends this header; falls back to server default. */
export function regionOf(req: Request): string | undefined {
  const r = req.header("x-mimir-region");
  return r && r.length > 0 ? r : undefined;
}

/** Wrap an async handler so thrown/rejected errors hit the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/** Express error middleware that normalizes AWS SDK errors for the UI. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const e = err as {
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
    Code?: string;
  };
  const status = e?.$metadata?.httpStatusCode ?? 500;
  const code = e?.name ?? e?.Code ?? "InternalError";
  const message = e?.message ?? "Unexpected error";

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error("[error]", code, message);
  }

  res.status(status >= 400 ? status : 500).json({
    error: { code, message },
  });
}
