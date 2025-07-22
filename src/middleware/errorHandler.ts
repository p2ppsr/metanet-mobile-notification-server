import { Request, Response, NextFunction } from "express";

interface CustomError extends Error {
  status?: number;
  code?: string;
  isJoi?: boolean;
  details?: Array<{ message: string; path: string[] }>;
}

/**
 * Global error handling middleware
 * Catches and formats all unhandled errors
 */
function errorHandler(
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.error("❌ Unhandled error:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body,
  });

  // Firebase specific errors
  if (err.code && err.code.startsWith("firebase")) {
    return res.status(500).json({
      error: "Firebase Error",
      message: "An error occurred with Firebase services",
      code: err.code,
    });
  }

  // Validation errors (Joi)
  if (err.isJoi && err.details) {
    return res.status(400).json({
      error: "Validation Error",
      message: err.details[0]?.message || "Validation failed",
      field: err.details[0]?.path.join(".") || "unknown",
    });
  }

  // JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "Invalid JSON",
      message: "Request body contains invalid JSON",
    });
  }

  // Database connection errors
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return res.status(503).json({
      error: "Service Unavailable",
      message: "Database connection failed",
    });
  }

  // Rate limiting errors
  if (err.status === 429) {
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded",
    });
  }

  // Default error response
  const isDevelopment = process.env.NODE_ENV !== "production";

  res.status(err.status || 500).json({
    error: "Internal Server Error",
    message: isDevelopment ? err.message : "An unexpected error occurred",
    ...(isDevelopment && { stack: err.stack }),
  });

  return;
}

/**
 * 404 error handler for unmatched routes
 */
function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
    availableEndpoints: {
      health: "GET /health",
      register: "POST /api/v1/subscriptions/register",
      send: "POST /api/v1/notifications/send",
      permissions: "GET /api/v1/subscriptions/permissions/:userKey",
      unsubscribe: "DELETE /api/v1/subscriptions/:userKey",
    },
  });
}

export { errorHandler, notFoundHandler };
