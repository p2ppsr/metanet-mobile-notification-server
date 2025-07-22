import { NextFunction, Request, Response } from "express";
import { getFirestore } from "../config/firebase";
import { AuthenticatedRequest } from "../types";

/**
 * API key validation middleware
 * Validates API keys and sets origin information
 */
async function validateApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    console.log('Authorization header:', authHeader);
    console.log('API Key:', authHeader?.substring(7));

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log('Missing or malformed Authorization header');
      return res.status(401).json({
        error: "Unauthorized",
        message: "API key required in Authorization header",
      });
    }

    const apiKey = authHeader.substring(7);

    // In development, allow test API key (check BEFORE length validation)
    if (
      process.env.NODE_ENV !== "production" &&
      apiKey === "dev-test-api-key-12345"
    ) {
      console.log('Development mode: Test API key accepted');
      (req as AuthenticatedRequest).origin = "localhost:3000";
      (req as AuthenticatedRequest).apiKeyInfo = {
        origin: "localhost:3000",
        permissions: ["notifications:send", "subscriptions:manage"],
        createdBy: "dev-test-api-key-12345",
        environment: "development",
      };
      return next();
    }

    if (!apiKey || apiKey.length < 32) {
      console.log('Invalid API key format');
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key format",
      });
    }

    // Validate API key against database
    const db = getFirestore();
    console.log(`Querying Firestore for API key: ${apiKey}`);
    console.log(`Collection: apiKeys, Document ID: ${apiKey}`);

    // Debug: Try to list collections to see what's accessible
    try {
      console.log("Testing Firestore access - listing collections...");
      const collections = await db.listCollections();
      console.log(
        `Found ${collections.length} collections:`,
        collections.map((c) => c.id),
      );
    } catch (listError) {
      console.log("Error listing collections:", (listError as Error).message);
    }

    // Debug: Try to get the apiKeys collection reference
    try {
      console.log("Getting apiKeys collection reference...");
      const apiKeysCollection = db.collection("apiKeys");
      console.log("apiKeys collection reference created successfully");

      // Try to list documents in the collection
      const snapshot = await apiKeysCollection.limit(5).get();
      console.log(`Found ${snapshot.size} documents in apiKeys collection`);
      snapshot.docs.forEach((doc) => {
        console.log(`Document ID: ${doc.id}`);
      });
    } catch (collectionError) {
      console.log(
        "Error accessing apiKeys collection:",
        (collectionError as Error).message,
      );
    }

    const apiKeyDoc = await db.collection("apiKeys").doc(apiKey).get();

    if (!apiKeyDoc.exists) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key",
      });
    }

    const apiKeyData = apiKeyDoc.data();

    // Check if API key is active
    if (!apiKeyData?.active) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "API key has been deactivated",
      });
    }

    // Check if API key has expired
    if (apiKeyData.expiresAt && Date.now() > apiKeyData.expiresAt) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "API key has expired",
      });
    }

    // Set request context
    (req as AuthenticatedRequest).origin = apiKeyData.origin;
    (req as AuthenticatedRequest).apiKeyInfo = {
      origin: apiKeyData.origin,
      permissions: apiKeyData.permissions || [],
      createdBy: apiKeyData.createdBy,
      environment: apiKeyData.environment || "production",
    };

    // Log API usage
    await db.collection("apiUsage").add({
      apiKey: apiKey,
      origin: apiKeyData.origin,
      endpoint: req.path,
      method: req.method,
      timestamp: Date.now(),
      userAgent: req.get("User-Agent"),
      ip: req.ip,
    });

    console.log(
      `🔑 API key validated for origin: ${apiKeyData.origin} - ${req.method} ${req.path}`,
    );

    next();
  } catch (error) {
    console.error("❌ API key validation error:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to validate API key",
    });
  }
}

/**
 * Permission check middleware
 * Checks if the API key has specific permissions
 */
function requirePermission(permission: string) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.apiKeyInfo || !req.apiKeyInfo.permissions) {
      res.status(403).json({
        error: "Forbidden",
        message: "No permissions information available",
      });
      return;
    }

    if (!req.apiKeyInfo.permissions.includes(permission)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Permission '${permission}' required for this operation`,
      });
      return;
    }

    next();
  };
}

export { validateApiKey, requirePermission };
