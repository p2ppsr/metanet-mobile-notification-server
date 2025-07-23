import express, { Request, Response } from "express";
import Joi from "joi";
import { v4 as uuidv4 } from "uuid";
import { sendNotification, getFirestore } from "../config/firebase";
import { validateApiKey } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import * as admin from "firebase-admin";

const router = express.Router();

// Validation schema for notification payload
const notificationSchema = Joi.object({
  userKey: Joi.string().required(),
  notification: Joi.object({
    title: Joi.string().required().max(100),
    body: Joi.string().required().max(200),
    icon: Joi.string().uri().optional(),
    badge: Joi.number().integer().min(0).optional(),
    data: Joi.object().optional(),
  }).required(),
  options: Joi.object({
    requireInteraction: Joi.boolean().optional(),
    silent: Joi.boolean().optional(),
    tag: Joi.string().optional(),
    timestamp: Joi.number().optional(),
  }).optional(),
});

/**
 * POST /api/v1/notifications/send
 * Send a push notification to a user
 */
router.post("/send", validateApiKey, async (req, res) => {
  try {
    // Validate request body
    const { error, value } = notificationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: "Validation Error",
        message: error.details[0]?.message || "Validation failed",
      });
    }

    const { userKey, notification, options } = value;
    const origin = req.get('Origin') || req.headers['origin'] || req.headers['host'];

    // Ensure origin is defined (should be set by middleware)
    if (!origin) {
      return res.status(500).json({
        error: "Server Error",
        message: "Request origin not properly set by middleware",
      });
    }

    console.log(
      `📤 Notification request from ${origin} for userKey: ${userKey.substring(0, 8)}...`,
    );

    // Get user subscription from database
    const db = getFirestore();
    const userDoc = await db.collection("subscriptions").doc(userKey).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: "User Not Found",
        message: "No subscription found for this user key",
      });
    }

    const userData = userDoc.data();

    // Check if userData exists
    if (!userData) {
      return res.status(500).json({
        error: "Data Error",
        message: "User subscription data is corrupted or missing",
      });
    }

    // Verify origin has permission
    if (
      !userData.permissions?.[origin || '']
    ) {
      return res.status(403).json({
        error: "Permission Denied",
        message:
          "Origin does not have permission to send notifications to this user",
      });
    }

    // Check if FCM token exists
    if (!userData.fcmToken) {
      return res.status(400).json({
        error: "No FCM Token",
        message: "User has no valid FCM token for notifications",
      });
    }

    // Send notification
    const messageId = uuidv4();
    const payload = {
      title: notification.title,
      body: notification.body,
      icon: notification.icon,
      badge: notification.badge,
      data: {
        ...notification.data,
        origin: origin,
        messageId: messageId,
        timestamp: Date.now().toString(),
      },
    };

    await sendNotification(userData.fcmToken, payload);

    // Log notification for analytics
    await db.collection("notifications").doc(messageId).set({
      userKey: userKey,
      origin: origin,
      title: notification.title,
      body: notification.body,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "sent",
    });

    console.log(`✅ Notification sent successfully - MessageID: ${messageId}`);

    res.status(200).json({
      success: true,
      messageId: messageId,
      timestamp: Date.now(),
    });
    return;
  } catch (error) {
    console.error("❌ Error sending notification:", error);

    if (
      (error as any).code === "messaging/invalid-registration-token" ||
      (error as any).code === "messaging/registration-token-not-registered"
    ) {
      return res.status(410).json({
        error: "Invalid Token",
        message: "FCM token is no longer valid",
      });
    }

    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to send notification",
    });
    return;
  }
});

/**
 * GET /api/v1/notifications/status/:messageId
 * Check the status of a sent notification
 */
router.get("/status/:messageId", validateApiKey, async (req, res) => {
  try {
    const { messageId } = req.params;

    // Validate messageId parameter
    if (!messageId) {
      return res.status(400).json({
        error: "Invalid Request",
        message: "Message ID parameter is required",
      });
    }

    const db = getFirestore();
    const notificationDoc = await db
      .collection("notifications")
      .doc(messageId)
      .get();

    if (!notificationDoc.exists) {
      return res.status(404).json({
        error: "Notification Not Found",
        message: "No notification found with this message ID",
      });
    }

    const notificationData = notificationDoc.data();

    // Check if notificationData exists
    if (!notificationData) {
      return res.status(500).json({
        error: "Data Error",
        message: "Notification data is corrupted or missing",
      });
    }

    res.status(200).json({
      messageId: messageId,
      status: notificationData.status,
      timestamp: notificationData.timestamp,
      origin: notificationData.origin,
    });
    return;
  } catch (error) {
    console.error("❌ Error checking notification status:", error);
    res.status(500).json({
      error: "Internal Server Error",
      message: "Failed to check notification status",
    });
    return;
  }
});

export default router;
