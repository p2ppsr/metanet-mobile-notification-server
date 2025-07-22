import express from "express";
import Joi from "joi";
import { getFirestore } from "../config/firebase";
import { validateApiKey } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { registerSubscription } from '../controllers/subscriptionController';
import { sendPushNotification } from '../controllers/sendPushController';

const router = express.Router();

// Validation schema for push subscription
const subscriptionSchema = Joi.object({
  endpoint: Joi.string().uri().required(),
  expirationTime: Joi.date().allow(null).optional(),
  keys: Joi.object({
    p256dh: Joi.string().required(),
    auth: Joi.string().required(),
  }).required(),
  userId: Joi.string().required(), // Metanet user ID
  deviceInfo: Joi.object({
    platform: Joi.string().valid("ios", "android").required(),
    appVersion: Joi.string().optional(),
    deviceId: Joi.string().optional(),
  }).optional(),
});

// Validation schema for permission update
const permissionSchema = Joi.object({
  userKey: Joi.string().required(),
  granted: Joi.boolean().required(),
});

/**
 * POST /api/v1/subscriptions/register
 * Register a new push subscription from metanet-mobile
 */
router.post("/register", validateApiKey, (req, res, next) => {
  console.log('Received subscription registration request:', req.body);
  next();
}, registerSubscription);

/**
 * POST /api/v1/subscriptions/send
 * Send a test notification
 */
router.post("/send", validateApiKey, (req, res, next) => {
  console.log('Received send notification request:', req.body);
  next();
}, sendPushNotification);

/**
 * DELETE /api/v1/subscriptions/:userKey
 * Unsubscribe a user from notifications
 */
router.delete("/:userKey", validateApiKey, async (req, res) => {
  try {
    const { userKey } = req.params;
    const origin = (req as AuthenticatedRequest).origin;

    if (!userKey) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User key parameter is required",
      });
    }

    const db = getFirestore();
    const userDoc = await db.collection("subscriptions").doc(userKey).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "Subscription Not Found",
        message: "No subscription found for this user key",
      });
    }

    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({
        error: "User Data Not Found",
        message: "User data is missing or corrupted",
      });
    }

    // Remove permission for this origin
    if (userData.permissions && origin && userData.permissions[origin]) {
      delete userData.permissions[origin];
    }

    // If no permissions left, deactivate subscription
    const hasActivePermissions = Object.values(userData.permissions || {}).some(
      (permission) => (permission as any)?.granted,
    );

    if (!hasActivePermissions) {
      userData.active = false;
    }

    userData.updatedAt = Date.now();

    await db.collection("subscriptions").doc(userKey).set(userData);

    // Log unsubscription event
    await db.collection("events").add({
      type: "subscription_removed",
      userKey: userKey,
      origin: origin,
      timestamp: Date.now(),
    });

    console.log("🗑️ Subscription removed successfully for userKey:", userKey);
    res.status(200).json({
      success: true,
      message: "Subscription removed successfully",
    });
    return;
  } catch (error) {
    console.error("❌ Error removing subscription:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to remove subscription",
    });
    return;
  }
});

/**
 * GET /api/v1/subscriptions/permissions/:userKey
 * Check permissions for a user key
 */
router.get("/permissions/:userKey", validateApiKey, async (req, res) => {
  try {
    const { userKey } = req.params;
    const origin = (req as AuthenticatedRequest).origin;

    if (!userKey) {
      return res.status(400).json({
        error: "Bad Request",
        message: "User key parameter is required",
      });
    }

    const db = getFirestore();
    const userDoc = await db.collection("subscriptions").doc(userKey).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "User Not Found",
        message: "No subscription found for this user key",
      });
    }

    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({
        error: "User Data Not Found",
        message: "User data is missing or corrupted",
      });
    }

    const hasPermission =
      userData.permissions &&
      origin &&
      userData.permissions[origin] &&
      userData.permissions[origin].granted;

    res.status(200).json({
      userKey: userKey,
      origin: origin,
      hasPermission: hasPermission,
      timestamp:
        hasPermission && origin ? userData.permissions[origin].timestamp : null,
      active: userData.active || false,
    });
    return;
  } catch (error) {
    console.error("❌ Error checking permissions:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check permissions",
    });
    return;
  }
});

/**
 * Helper function to extract FCM token from endpoint URL
 */
function extractFCMToken(endpoint: string): string | null {
  try {
    // FCM endpoints format: https://fcm.googleapis.com/fcm/send/{token}
    const match = endpoint.match(/fcm\/send\/(.+)$/);
    return match ? match[1] || null : null;
  } catch (error) {
    console.error("Error extracting FCM token:", error);
    return null;
  }
}

/**
 * Generate a unique user key for user-origin combination
 */
function generateUserKey(userId: string, origin: string): string {
  // Create a deterministic key based on userId and origin
  const crypto = require("crypto");
  const combined = `${userId}:${origin}`;
  return crypto
    .createHash("sha256")
    .update(combined)
    .digest("hex")
    .substring(0, 32);
}

export default router;
