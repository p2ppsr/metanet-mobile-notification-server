import { Request } from "express";

// Push subscription types
export interface PushSubscription {
  endpoint: string;
  expirationTime?: Date | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface DeviceInfo {
  platform: "ios" | "android" | "web";
  appVersion?: string;
  deviceId?: string;
}

export interface SubscriptionRequest extends PushSubscription {
  userId: string;
  deviceInfo?: DeviceInfo;
}

// Notification types
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  data?: Record<string, any>;
}

export interface NotificationRequest {
  userKey: string;
  notification: NotificationPayload;
  options?: {
    requireInteraction?: boolean;
    silent?: boolean;
    tag?: string;
    timestamp?: number;
  };
}

export interface NotificationResponse {
  success: boolean;
  messageId: string;
  timestamp: number;
}

// Database types
export interface UserSubscription {
  userKey: string;
  userId: string;
  origin: string;
  fcmToken: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  deviceInfo?: DeviceInfo;
  permissions: Record<string, PermissionInfo>;
  createdAt: number;
  updatedAt: number;
  active: boolean;
}

export interface PermissionInfo {
  granted: boolean;
  timestamp: number;
}

export interface ApiKeyInfo {
  apiKey: string;
  origin: string;
  permissions: string[];
  active: boolean;
  createdBy: string;
  createdAt: number;
  expiresAt?: number;
  environment?: "development" | "production";
}

export interface NotificationLog {
  messageId: string;
  userKey: string;
  origin: string;
  title: string;
  body: string;
  timestamp: any; // Firestore timestamp
  status: "sent" | "delivered" | "failed";
}

// Express extended request types
export interface AuthenticatedRequest extends Request {
  origin?: string;
  apiKeyInfo?: {
    origin: string;
    permissions: string[];
    createdBy: string;
    environment: "development" | "production";
  };
}

// API response types
export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
}

export interface ErrorResponse extends ApiResponse {
  success: false;
  error: string;
  message: string;
}

export interface SuccessResponse<T = any> extends ApiResponse<T> {
  success: true;
  data?: T;
}

// Health check types
export interface HealthCheck {
  status: "healthy" | "unhealthy" | "ready" | "not ready" | "alive" | "error";
  service: string;
  version: string;
  timestamp: string;
  uptime?: number;
  checks?: Record<string, boolean>;
  environment?: string;
  error?: string;
}
