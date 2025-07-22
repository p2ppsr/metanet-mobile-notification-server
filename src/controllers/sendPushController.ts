// src/controllers/sendPushController.ts
import { Request, Response } from 'express';
import { getFirestore, getMessaging, sendNotification, sendWebPushNotification } from '../config/firebase';

export async function sendPushNotification(req: Request, res: Response) {
  const { userId, origin, message } = req.body;
  console.log('Request data:', { userId, origin, message });

  if (!userId || !origin) {
    return res.status(400).json({ error: 'Missing userId or origin' });
  }

  const userKey = userId + '-' + Buffer.from(origin).toString('base64');
  console.log('Generated userKey:', userKey);
  console.log('Looking for document with ID:', userKey);
  
  const doc = await getFirestore().collection('subscriptions').doc(userKey).get();
  console.log('Document exists:', doc.exists);
  
  if (!doc.exists) {
    console.log('Document not found. Available documents might have different IDs.');
    return res.status(404).json({ error: 'Subscription not found' });
  }

  const sub = doc.data();

  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  console.log('Processing push notification for user:', userId);
  console.log('Subscription data:', sub);

  try {
    if (sub.fcmToken) {
      console.log('Using FCM token:', sub.fcmToken);
      await getMessaging().send({
        token: sub.fcmToken,
        notification: {
          title: 'Metanet Notification',
          body: message || 'Test push from backend!',
        },
      });
      return res.json({ success: true, method: 'FCM' });
    } else if (sub.endpoint && sub.keys) {
      console.log('Sending Web Push notification');
      console.log('Endpoint:', sub.endpoint);
      console.log('Keys:', sub.keys);
      
      const webPushPayload = {
        title: 'Metanet Web Push',
        body: message || 'Test Web Push from backend!',
        icon: '/icon-192x192.png',
        badge: 1
      };

      const webPushSubscription = {
        endpoint: sub.endpoint as string,
        keys: {
          p256dh: sub.keys.p256dh as string,
          auth: sub.keys.auth as string
        }
      };
      
      await sendWebPushNotification(webPushSubscription, webPushPayload);
      return res.json({ success: true, method: 'WebPush' });
    } else {
      return res.status(400).json({ error: 'Incomplete subscription data' });
    }
  } catch (error: any) {
    console.error('❌ Push send error:', error);
    return res.status(500).json({ error: 'Push failed', details: error.message });
  }
}
