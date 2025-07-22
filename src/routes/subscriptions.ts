import express from 'express';
import Joi from 'joi';
import { getFirestore } from '../config/firebase';
import { validateApiKey } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = express.Router();

// Validation schema for push subscription
const subscriptionSchema = Joi.object({
  endpoint: Joi.string().uri().required(),
  expirationTime: Joi.date().allow(null).optional(),
  keys: Joi.object({
    p256dh: Joi.string().required(),
    auth: Joi.string().required()
  }).required(),
  userId: Joi.string().required(), // Metanet user ID
  deviceInfo: Joi.object({
    platform: Joi.string().valid('ios', 'android').required(),
    appVersion: Joi.string().optional(),
    deviceId: Joi.string().optional()
  }).optional()
});

// Validation schema for permission update
const permissionSchema = Joi.object({
  userKey: Joi.string().required(),
  granted: Joi.boolean().required()
});

/**
 * POST /api/v1/subscriptions/register
 * Register a new push subscription from metanet-mobile
 */
router.post('/register', validateApiKey, async (req, res) => {
  try {
    console.log('🔍 Validating subscription request:', req.body);
    // Validate request body
    const { error, value } = subscriptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details?.[0]?.message || 'Invalid request data'
      });
    }

    const { endpoint, keys, userId, deviceInfo = {} } = value;
    const origin = (req as AuthenticatedRequest).origin; // Set by validateApiKey middleware

    // Ensure origin is defined (should be set by middleware)
    if (!origin) {
      return res.status(500).json({
        error: 'Server Error',
        message: 'Request origin not properly set by middleware'
      });
    }

    console.log(`📝 Subscription registration from ${origin} for userId: ${userId}`);

    // Extract FCM token from endpoint
    const fcmToken = extractFCMToken(endpoint);
    console.log('🗝️ Extracted FCM token:', fcmToken);
    if (!fcmToken) {
      return res.status(400).json({
        error: 'Invalid Endpoint',
        message: 'Could not extract FCM token from endpoint'
      });
    }

    // Generate unique user key for this user-origin combination
    const userKey = generateUserKey(userId, origin);
    console.log('🆔 Generated user key:', userKey);

    // In development, skip Firestore operations
    const isDev = process.env.NODE_ENV !== 'production' && 
                  (req as AuthenticatedRequest).apiKeyInfo?.environment === 'development';
    
    if (isDev) {
      // Development mode: just return success with mock data
      console.log(`🧪 DEV MODE: Mock subscription registered for userId: ${userId}`);
      
      res.status(201).json({
        success: true,
        userKey: userKey,
        message: 'Subscription registered successfully (dev mode)'
      });
      return;
    }

    const db = getFirestore();
    
    // Check if subscription already exists
    const existingDoc = await db.collection('subscriptions').doc(userKey).get();
    
    const subscriptionData = {
      userKey: userKey,
      userId: userId,
      origin: origin,
      fcmToken: fcmToken,
      endpoint: endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth
      },
      deviceInfo: deviceInfo,
      permissions: {
        [origin]: {
          granted: true,
          timestamp: Date.now()
        }
      },
      createdAt: existingDoc.exists ? (existingDoc.data()?.createdAt || Date.now()) : Date.now(),
      updatedAt: Date.now(),
      active: true
    };
    console.log('📦 Subscription data prepared for database:', subscriptionData);

    // If subscription exists, merge permissions
    if (existingDoc.exists) {
      const existingData = existingDoc.data();
      if (existingData) {
        subscriptionData.permissions = {
          ...existingData.permissions,
          [origin]: {
            granted: true,
            timestamp: Date.now()
          }
        };
      }
      console.log(`🔄 Updated existing subscription for userKey: ${userKey.substring(0, 8)}...`);
    } else {
      console.log(`🆕 Created new subscription for userKey: ${userKey.substring(0, 8)}...`);
    }

    // Save to database
    await db.collection('subscriptions').doc(userKey).set(subscriptionData);

    // Log registration event
    await db.collection('events').add({
      type: 'subscription_registered',
      userKey: userKey,
      origin: origin,
      userId: userId,
      timestamp: Date.now()
    });

    console.log('✅ Subscription registered successfully for userKey:', userKey);
    res.status(200).json({
      success: true,
      userKey: userKey,
      message: 'Subscription registered successfully'
    });
    return;

  } catch (error) {
    console.error('❌ Error registering subscription:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register subscription'
    });
    return;
  }
});

/**
 * DELETE /api/v1/subscriptions/:userKey
 * Unsubscribe a user from notifications
 */
router.delete('/:userKey', validateApiKey, async (req, res) => {
  try {
    const { userKey } = req.params;
    const origin = (req as AuthenticatedRequest).origin;

    if (!userKey) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User key parameter is required'
      });
    }

    const db = getFirestore();
    const userDoc = await db.collection('subscriptions').doc(userKey).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'Subscription Not Found',
        message: 'No subscription found for this user key'
      });
    }

    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({
        error: 'User Data Not Found',
        message: 'User data is missing or corrupted'
      });
    }

    // Remove permission for this origin
    if (userData.permissions && origin && userData.permissions[origin]) {
      delete userData.permissions[origin];
    }

    // If no permissions left, deactivate subscription
    const hasActivePermissions = Object.values(userData.permissions || {})
      .some(permission => (permission as any)?.granted);

    if (!hasActivePermissions) {
      userData.active = false;
    }

    userData.updatedAt = Date.now();

    await db.collection('subscriptions').doc(userKey).set(userData);

    // Log unsubscription event
    await db.collection('events').add({
      type: 'subscription_removed',
      userKey: userKey,
      origin: origin,
      timestamp: Date.now()
    });

    console.log('🗑️ Subscription removed successfully for userKey:', userKey);
    res.status(200).json({
      success: true,
      message: 'Subscription removed successfully'
    });
    return;

  } catch (error) {
    console.error('❌ Error removing subscription:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to remove subscription'
    });
    return; 
  }
});

/**
 * GET /api/v1/subscriptions/permissions/:userKey
 * Check permissions for a user key
 */
router.get('/permissions/:userKey', validateApiKey, async (req, res) => {
  try {
    const { userKey } = req.params;
    const origin = (req as AuthenticatedRequest).origin;

    if (!userKey) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User key parameter is required'
      });
    }

    const db = getFirestore();
    const userDoc = await db.collection('subscriptions').doc(userKey).get();

    if (!userDoc.exists) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'No subscription found for this user key'
      });
    }

    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({
        error: 'User Data Not Found',
        message: 'User data is missing or corrupted'
      });
    }

    const hasPermission = userData.permissions && 
                         origin && userData.permissions[origin] && 
                         userData.permissions[origin].granted;

    res.status(200).json({
      userKey: userKey,
      origin: origin,
      hasPermission: hasPermission,
      timestamp: hasPermission && origin ? userData.permissions[origin].timestamp : null,
      active: userData.active || false
    });
    return;

  } catch (error) {
    console.error('❌ Error checking permissions:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check permissions'
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
    return match ? (match[1] || null) : null;
  } catch (error) {
    console.error('Error extracting FCM token:', error);
    return null;
  }
}

/**
 * Generate a unique user key for user-origin combination
 */
function generateUserKey(userId: string, origin: string): string {
  // Create a deterministic key based on userId and origin
  const crypto = require('crypto');
  const combined = `${userId}:${origin}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
}

export default router;
