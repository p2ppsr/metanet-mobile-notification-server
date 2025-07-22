# Metanet Notification Backend

A backend service that enables websites to send push notifications to metanet-mobile users using standard Web Push API patterns.

## Overview

This backend acts as a bridge between websites and metanet-mobile users, allowing any website to send push notifications to users who have granted permission, even when the metanet-mobile app is closed.

## Features

- 🌐 **Standard Web Push API** - Uses familiar PushSubscription objects
- 🔐 **API Key Authentication** - Secure access control per website
- 📱 **Firebase Cloud Messaging** - Reliable cross-platform delivery
- ⚡ **Rate Limiting** - Prevents abuse and spam
- 📊 **Analytics & Logging** - Track notification performance
- 🏥 **Health Checks** - Kubernetes/Docker ready

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Website       │───▶│  This Backend    │───▶│ Firebase Cloud  │
│ (coinflip.com)  │    │   Service        │    │   Messaging     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │    Firestore    │    │ Metanet Mobile  │
                       │   (Database)    │    │     Users       │
                       └─────────────────┘    └─────────────────┘
```

## Installation

1. **Clone and Install Dependencies**
```bash
cd mobile-notification-backend
npm install
```

2. **Set Up Environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Configure Firebase**
   - Create a Firebase project
   - Generate a service account key
   - Place the key file in `./config/service-account-key.json`
   - Update `.env` with your project ID

4. **Start the Server**
```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### 🔗 Register Subscription
```http
POST /api/v1/subscriptions/register
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "endpoint": "https://fcm.googleapis.com/fcm/send/TOKEN",
  "keys": {
    "p256dh": "key-data",
    "auth": "auth-data"
  },
  "userId": "metanet-user-id",
  "deviceInfo": {
    "platform": "ios",
    "appVersion": "1.0.0"
  }
}
```

**Response:**
```json
{
  "success": true,
  "userKey": "unique-user-key-for-your-site",
  "message": "Subscription registered successfully"
}
```

### 📤 Send Notification
```http
POST /api/v1/notifications/send
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "userKey": "user-key-from-registration",
  "notification": {
    "title": "Coinflip Challenge!",
    "body": "John challenged you to a coinflip",
    "icon": "https://yoursite.com/icon.png",
    "data": {
      "challengeId": "abc123",
      "amount": 100
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "unique-message-id",
  "timestamp": 1642694400000
}
```

### 🔍 Check Permissions
```http
GET /api/v1/subscriptions/permissions/USER_KEY
Authorization: Bearer your-api-key
```

### 🗑️ Unsubscribe User
```http
DELETE /api/v1/subscriptions/USER_KEY
Authorization: Bearer your-api-key
```

## Website Integration Example

Here's how Coinflip Friend would integrate:

```javascript
// 1. When user grants permission in metanet-mobile
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: vapidKey
});

// 2. Register with metanet backend
const response = await fetch('https://notifications.metanet.app/api/v1/subscriptions/register', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + COINFLIP_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    ...subscription.toJSON(),
    userId: currentUserId,
    deviceInfo: { platform: 'web' }
  })
});

const { userKey } = await response.json();
// Store userKey with user in your database

// 3. Later, send challenge notification
await fetch('https://notifications.metanet.app/api/v1/notifications/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + COINFLIP_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userKey: storedUserKey,
    notification: {
      title: "Coinflip Challenge!",
      body: "John challenged you to a coinflip",
      data: { challengeId: "abc123" }
    }
  })
});
```

## Database Schema

### Subscriptions Collection
```typescript
{
  userKey: "unique-key",
  userId: "metanet-user-id", 
  origin: "coinflip.babbage.systems",
  fcmToken: "firebase-token",
  permissions: {
    "coinflip.babbage.systems": {
      granted: true,
      timestamp: 1642694400000
    }
  },
  active: true,
  createdAt: 1642694400000,
  updatedAt: 1642694400000
}
```

### API Keys Collection
```typescript
{
  apiKey: "generated-key",
  origin: "coinflip.babbage.systems",
  permissions: ["notifications:send", "subscriptions:manage"],
  active: true,
  createdBy: "admin-user-id",
  expiresAt: null
}
```

## Deployment

### Google Cloud Run (Recommended)
```bash
# Build container
docker build -t metanet-notifications .

# Deploy to Cloud Run
gcloud run deploy metanet-notifications \
  --image metanet-notifications \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### Railway/Render
1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically on push

### Environment Variables
```bash
PORT=3000
NODE_ENV=production
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_SERVICE_ACCOUNT_PATH=./config/service-account.json
```

## API Key Management

To create API keys for websites:

```javascript
// Run this script to create an API key
const { getFirestore } = require('./src/config/firebase');
const { v4: uuidv4 } = require('uuid');

const createApiKey = async (origin, permissions = ['notifications:send']) => {
  const apiKey = uuidv4().replace(/-/g, ''); // 32 char key
  const db = getFirestore();
  
  await db.collection('apiKeys').doc(apiKey).set({
    apiKey: apiKey,
    origin: origin,
    permissions: permissions,
    active: true,
    createdAt: Date.now(),
    createdBy: 'admin'
  });
  
  console.log(`API Key for ${origin}: ${apiKey}`);
  return apiKey;
};

// Usage
createApiKey('coinflip.babbage.systems');
```

## Rate Limits

- **Notifications**: 100 per 15 minutes per API key
- **Subscriptions**: 50 per 15 minutes per API key
- **General**: 200 per 15 minutes per API key

## Health Checks

- `GET /health` - Basic health check
- `GET /health/ready` - Readiness probe (checks Firebase)
- `GET /health/live` - Liveness probe

## Development

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

## Security Features

- 🔐 API key authentication
- 🛡️ CORS protection
- 🚦 Rate limiting
- 📝 Request logging
- 🔒 Helmet security headers
- ✅ Input validation

## Monitoring

The service logs all activities and includes metrics for:
- Notification success/failure rates
- API key usage
- Response times
- Error rates

## Support

For integration help or issues:
1. Check the health endpoints
2. Review server logs
3. Verify API key permissions
4. Test with development API key: `dev-test-api-key-12345`
