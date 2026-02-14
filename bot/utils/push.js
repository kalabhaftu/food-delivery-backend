const admin = require('firebase-admin');
const supabase = require('../config/supabase');

// Initialize Firebase Admin (handles Multiple Init)
if (!admin.apps.length) {
    try {
        const envJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_ADMINSDK_JSON;
        if (envJson) {
            const serviceAccount = JSON.parse(envJson);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ Firebase Admin SDK Initialized');
        } else {
            console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT missing. Push notifications disabled.');
        }
    } catch (err) {
        console.error('❌ Firebase Init Error:', err.message);
    }
}

/**
 * Sends a push notification to a specific user
 * @param {string} userId - Supabase User ID
 * @param {string} title - Notification Title
 * @param {string} body - Notification Body
 */
const sendPushToUser = async (userId, title, body) => {
    if (!admin.apps.length) return;

    try {
        // Fetch FCM token from profile
        const { data, error } = await supabase
            .from('profiles')
            .select('fcm_token')
            .eq('id', userId)
            .single();

        if (error || !data?.fcm_token) {
            console.log(`[FCM] No token found for user ${userId}`);
            return;
        }

        const message = {
            notification: { title, body },
            token: data.fcm_token,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'order_updates'
                }
            }
        };

        const response = await admin.messaging().send(message);
        console.log(`[FCM] Push sent to ${userId}:`, response);
    } catch (err) {
        console.error(`[FCM] Error sending to ${userId}:`, err.message);
    }
};

/**
 * Sends a push notification to all active drivers
 * @param {string} title 
 * @param {string} body 
 */
const sendPushToDrivers = async (title, body) => {
    if (!admin.apps.length) return;

    try {
        const { data: drivers, error } = await supabase
            .from('profiles')
            .select('fcm_token')
            .eq('role', 'driver');

        if (error || !drivers) return;

        const tokens = drivers.map(d => d.fcm_token).filter(t => !!t);
        if (tokens.length === 0) return;

        const message = {
            notification: { title, body },
            tokens: tokens,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'driver_orders'
                }
            }
        };

        const response = await admin.messaging().sendMulticast(message);
        console.log(`[FCM] Multicast sent to ${tokens.length} drivers:`, response.successCount, 'successes');
    } catch (err) {
        console.error('[FCM] Multicast Error:', err.message);
    }
};

/**
 * Sends a multicast push notification to a list of tokens
 * @param {string[]} tokens - Array of FCM tokens
 * @param {string} title 
 * @param {string} body 
 */
const sendMulticast = async (tokens, title, body) => {
    if (!admin.apps.length || !tokens || tokens.length === 0) return;

    try {
        const message = {
            notification: { title, body },
            tokens: tokens,
            android: {
                priority: 'high',
                notification: {
                    channelId: 'announcements'
                }
            }
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`[FCM] Broadcast sent to ${tokens.length} devices:`, response.successCount, 'successes');
        return response;
    } catch (err) {
        console.error('[FCM] Broadcast Error:', err.message);
        return null;
    }
};

module.exports = { sendPushToUser, sendPushToDrivers, sendMulticast };
