const admin = require('firebase-admin');

// Firebase Initialization (Unified)
// Checks FIREBASE_ADMINSDK_JSON first (shared with bot), then FIREBASE_SERVICE_ACCOUNT as fallback.
// Reuses existing app if bot/utils/push.js already initialized it.

let messaging;

try {
    if (admin.apps.length) {
        // Already initialized by bot/utils/push.js — reuse it
        messaging = admin.messaging();
        console.log('[Firebase API] Reusing existing Admin SDK instance');
    } else {
        const envJson = process.env.FIREBASE_ADMINSDK_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
        if (envJson) {
            const serviceAccount = JSON.parse(envJson);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            messaging = admin.messaging();
            console.log('[Firebase API] Admin SDK Initialized Successfully');
        } else {
            console.warn('[Firebase API] No service account found (set FIREBASE_ADMINSDK_JSON env var). Notifications will be logged to console only.');
        }
    }
} catch (e) {
    console.error('[Firebase API] Initialization Error:', e.message);
}

/**
 * Sends a real FCM notification.
 * @param {string} token - The destination FCM token.
 * @param {string} title - The notification title.
 * @param {string} body - The notification body.
 * @param {Object} data - Optional data payload.
 */
async function sendFcmNotification(token, title, body, data = {}) {
    if (!token) return;

    const message = {
        notification: { title, body },
        data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' }, // Standard for many mobile frameworks
        token: token
    };

    if (messaging) {
        try {
            const response = await messaging.send(message);
            console.log('[Firebase] Successfully sent message:', response);
            return response;
        } catch (error) {
            console.error('[Firebase] Error sending message:', error.message);
        }
    } else {
        console.log(`[Push Placeholder] To: ${token} | ${title}: ${body}`);
    }
}

module.exports = { sendFcmNotification };
