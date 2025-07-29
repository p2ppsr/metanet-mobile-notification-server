import express, { Request, Response } from "express";
import { getFirestore, getMessaging } from "../config/firebase";

const router = express.Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get("/", (req, res) => {
  console.log("Health check request received");
  res.status(200).json({
    status: "healthy",
    service: "Metanet Notification Backend",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready
 * Readiness probe - checks if all dependencies are available
 */
router.get("/ready", async (req, res) => {
  console.log("Readiness check request received");
  try {
    const checks = {
      firebase: false,
      firestore: false,
      messaging: false,
    };

    // Check Firebase connection
    try {
      const db = getFirestore();
      await db.collection("_health").limit(1).get();
      checks.firestore = true;
      checks.firebase = true;
    } catch (error) {
      console.warn(
        "Firestore health check failed:",
        error instanceof Error ? error.message : String(error),
      );
    }

    // Check Firebase Messaging
    try {
      const messaging = getMessaging();
      // Just check if messaging instance is available
      if (messaging) {
        checks.messaging = true;
      }
    } catch (error) {
      console.warn(
        "Firebase Messaging health check failed:",
        error instanceof Error ? error.message : String(error),
      );
    }

    const isReady = Object.values(checks).every(Boolean);

    res.status(isReady ? 200 : 503).json({
      status: isReady ? "ready" : "not ready",
      service: "Metanet Notification Backend",
      timestamp: new Date().toISOString(),
      checks: checks,
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    console.error("Health check error:", error);
    res.status(503).json({
      status: "error",
      service: "Metanet Notification Backend",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /health/live
 * Liveness probe - simple check that the server is running
 */
router.get("/live", (req, res) => {
  console.log("Liveness check request received");
  res.status(200).json({
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

export default router;
