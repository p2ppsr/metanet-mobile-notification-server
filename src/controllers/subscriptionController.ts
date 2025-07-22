// src/controllers/subscriptionController.ts
import { getFirestore } from '../config/firebase'  // your initialized Firestore
import { Request, Response } from 'express'

export async function registerSubscription(req: Request, res: Response) {
  try {
    const { endpoint, keys, fcmToken, origin, platform, userId } = req.body

    console.log('Registering subscription with data:', { endpoint, keys, fcmToken, origin, platform, userId });

    if (!origin || !userId) {
      console.log('Missing origin or userId');
      return res.status(400).json({ error: 'Missing origin or userId' })
    }

    let userKey = userId + '-' + Buffer.from(origin).toString('base64')
    console.log('Generated userKey:', userKey);

    const docRef = getFirestore().collection('subscriptions').doc(userKey)

    const data: Record<string, any> = {
      userId,
      origin,
      platform: platform || 'unknown',
      timestamp: new Date()
    }

    if (fcmToken) {
      data.fcmToken = fcmToken
    } else if (endpoint && keys?.auth && keys?.p256dh) {
      data.endpoint = endpoint
      data.keys = keys
    } else {
      console.log('Invalid subscription format');
      return res.status(400).json({ error: 'Invalid subscription format' })
    }

    await docRef.set(data)
    console.log(`✅ Registered ${fcmToken ? 'native' : 'web'} subscription: ${userKey}`)

    return res.status(200).json({ success: true, userKey })
  } catch (error) {
    console.error('❌ Subscription registration error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
