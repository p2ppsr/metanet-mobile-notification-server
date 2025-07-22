import * as admin from 'firebase-admin';
import { NotificationPayload } from '../types';
import * as path from 'path';

let firebaseApp: admin.app.App | null = null;

/**
 * Initialize Firebase Admin SDK
 */
export function initializeFirebase(): admin.app.App {
  if (firebaseApp) {
    console.log('🔥 Firebase already initialized');
    return firebaseApp;
  }

  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!projectId) {
      throw new Error('FIREBASE_PROJECT_ID environment variable is required');
    }

    let credential: admin.credential.Credential;
    
    if (serviceAccountPath) {
      console.log('🔑 Using Firebase service account key file');
      const absolutePath = path.resolve(process.cwd(), serviceAccountPath);
      credential = admin.credential.cert(require(absolutePath));
    } else {
      console.log('🔑 Using Firebase default credentials');
      console.log('🔑 Using Firebase default credentials');
      credential = admin.credential.applicationDefault();
    }

    firebaseApp = admin.initializeApp({
      credential: credential,
      projectId: projectId
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase initialization failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Get Firebase Messaging instance
 */
export function getMessaging(): admin.messaging.Messaging {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return admin.messaging();
}

/**
 * Get Firestore instance
 */
export function getFirestore(): admin.firestore.Firestore {
  if (!firebaseApp) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return admin.firestore();
}

interface FCMPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  data?: Record<string, string>;
}

interface SendNotificationResult {
  success: boolean;
  messageId: string;
}

/**
 * Send a push notification via FCM
 */
export async function sendNotification(
  fcmToken: string, 
  payload: FCMPayload
): Promise<SendNotificationResult> {
  try {
    const messaging = getMessaging();
    
    const message: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
        ...(payload.icon && { imageUrl: payload.icon })
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          clickAction: 'OPEN_ACTIVITY_1',
          ...(payload.badge && { notificationCount: payload.badge })
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body
            },
            sound: 'default',
            badge: payload.badge || 1
          }
        }
      }
    };

    const response = await messaging.send(message);
    console.log('✅ Notification sent successfully:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    throw error;
  }
}
