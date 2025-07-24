// controllers/subscriptionController.ts

import { Request, Response } from "express";
import { getFirestore } from "../config/firebase";
import * as admin from "firebase-admin";

export const registerSubscription = async (req: Request, res: Response) => {
  try {
    const db = getFirestore();

    const {
      endpoint,
      keys,
      userId,
      deviceInfo,
      fcmToken,
    } = req.body;

    const origin = req.get('Origin') || req.headers['origin'] || req.headers['host'];
    const userKey = `${userId}-${Buffer.from(origin || '').toString("base64")}`;

    if (!fcmToken) {
      return res.status(400).json({ error: "Missing FCM token" });
    }

    const subscriptionData = {
      endpoint,
      keys,
      fcmToken,
      origin,
      userId,
      platform: deviceInfo?.platform || "unknown",
      deviceInfo: deviceInfo || {},
      timestamp: Date.now(),
      active: true,
      permissions: {
        [origin || '']: {
          granted: true,
          timestamp: Date.now(),
        },
      },
    };

    await db.collection("subscriptions").doc(userKey).set(subscriptionData, { merge: true });

    console.log(`✅ Subscription registered for ${userKey}`);
    return res.status(200).json({ success: true, userKey });
  } catch (error) {
    console.error("❌ Error in registerSubscription:", error);
    return res.status(500).json({ error: "Internal Server Error", message: "Failed to register subscription" });
  }
};
