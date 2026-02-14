const express = require('express');
const axios = require('axios');
const supabase = require('../bot/config/supabase');
const { bot, notifyNewOrder, notifyCancellation, processedOrders, processedCancellations } = require('../bot/index');

// Optional Middlewares (Modernization Phase 2)
let helmet, compression, rateLimit;
try {
    helmet = require('helmet');
    compression = require('compression');
    rateLimit = require('express-rate-limit');
} catch (e) {
    console.warn('[Backend] Security middlewares missing, proceeding with basic security.');
}

const app = express();
app.set('trust proxy', 1); // Trust Vercel Proxy (Required for Rate Limiting)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const PROXY_HEADERS = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
};

// 1. Foundation: Performance & Security
if (compression) app.use(compression());
if (helmet) {
    app.use(helmet({
        contentSecurityPolicy: false, // Mobile compatibility
        crossOriginEmbedderPolicy: false
    }));
}

// 2. Body Parsing (Buffer-based for Binary Support)
// We capture rawBody as a Buffer to support binary uploads via proxy
app.use((req, res, next) => {
    // Skip body parsing for specific routes if needed, though this handler is safe
    if (req.path === '/api/upload-pod') return next();

    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
        const rawBody = Buffer.concat(chunks);

        // 4.5MB Payload Limit Guard (Prevents OOM during manual buffering)
        if (rawBody.length > 4.5 * 1024 * 1024) {
            return res.status(413).json({
                error: 'Payload Too Large',
                message: 'Request body exceeds the 4.5MB application limit.'
            });
        }

        req.rawBody = rawBody;

        if (req.headers['content-type']?.includes('application/json') && rawBody.length > 0) {
            try {
                req.body = JSON.parse(rawBody.toString('utf8'));
            } catch (e) {
                // Non-fatal: Body remains empty if JSON parse fails
            }
        }
        next();
    });
});

// 3. Rate Limiting
if (rateLimit) {
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200, // Limit each IP to 200 requests per window
        message: { error: 'Too many requests, please try again later.' }
    });
    app.use('/api/', limiter);
}

// --- ROUTES ---

// 1. Health & Suppress Favicon
app.get(['/', '/api', '/api/index', '/api/health'], (req, res) => {
    if (req.path === '/api/health') return res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Abebe | API Gateway</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8f9fa; color: #212529; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 2.5rem; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); text-align: center; max-width: 400px; width: 90%; }
                h1 { color: #4CAF50; margin: 0 0 0.5rem; font-size: 1.8rem; }
                p { margin: 0 0 1.5rem; color: #6c757d; }
                .status { background: #e8f5e9; color: #2e7d32; padding: 0.5rem 1rem; border-radius: 50px; display: inline-block; font-weight: 600; font-size: 0.9rem; }
                .meta { margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1.5rem; font-size: 0.8rem; color: #adb5bd; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>🍱 Abebe Food Delivery</h1>
                <p>Advanced Backend API Gateway</p>
                <div class="status">⚡ Operational</div>
                <div class="meta">
                    V2.5 Professional Infrastructure<br>
                    Time: ${new Date().toLocaleTimeString()}
                </div>
            </div>
        </body>
        </html>
    `);
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// 2. Legal Pages
app.get(['/legal', '/terms', '/api/legal', '/api/terms'], (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Legal Information | Abebe</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
                h1 { border-bottom: 2px solid #4CAF50; padding-bottom: 10px; color: #2e7d32; }
                h2 { margin-top: 30px; }
                .footer { margin-top: 50px; font-size: 0.8rem; color: #888; text-align: center; }
            </style>
        </head>
        <body>
            <h1>Legal & Privacy Policy</h1>
            <p>This policy outlines how the Abebe Food Delivery ecosystem handles your data as of 2025.</p>
            
            <h2>1. Location Data</h2>
            <p><strong>Customers:</strong> We collect your delivery address for order fulfillment. We do not track your live location.</p>
            <p><strong>Drivers:</strong> Live location tracking is enabled while you have an active delivery to provide real-time updates to the customer. This is essential for the service.</p>
            
            <h2>2. Data Security</h2>
            <p>All communication is encrypted via modern TLS standards. Partnered with Supabase for hardened infrastructure.</p>
            
            <h2>3. Contact</h2>
            <p>For data removal requests, contact the system administrator via the Telegram Bot.</p>
            
            <div class="footer">&copy; 2026 Abebe Food Delivery Infrastructure</div>
        </body>
        </html>
    `);
});

// 3. Verification Page
app.get('/api/verify', (req, res) => {
    res.status(200).send(`
        <!DOCTYPE html><html><head><title>Verify | Abebe</title></head>
        <body><div id="status">Verifying...</div><script>
            const hash = window.location.hash;
            if (hash.includes('access_token')) {
                document.getElementById('status').innerText = 'Verified! You can return to the app.';
            } else {
                document.getElementById('status').innerText = 'Invalid or expired link.';
            }
        </script></body></html>
    `);
});

// 4. Telegram Webhook
app.post(['/', '/api/bot', '/api/index'], async (req, res) => {
    if (req.body && (req.body.update_id || req.body.message)) {
        await bot.handleUpdate(req.body);
        return res.status(200).send('OK');
    }
    // Fallback for other POSTs
    res.status(200).send('Abebe Online');
});

// 5. Supabase Webhooks
app.post('/api/webhook/supabase', async (req, res) => {
    const { table, record, type, old_record } = req.body || {};
    const { sendFcmNotification } = require('./push');

    if (table === 'orders') {
        const displayCode = record?.display_code || 'N/A';
        const fcmData = { order_id: String(record?.public_id || record?.id), display_id: displayCode, type: 'order' };

        if (type === 'INSERT') {
            if (processedOrders?.has(record.id)) return res.status(200).end();
            processedOrders?.set(record.id, true);
            await notifyNewOrder(bot, record.id, true);

            // Notify customer of order reception (no driver notification yet - too early)
            const { data: profile } = await supabase.from('profiles').select('fcm_token').eq('id', record.user_id).single();
            if (profile?.fcm_token) {
                await sendFcmNotification(profile.fcm_token, "Order Placed", `Order #${displayCode} has been placed and is being reviewed!`, fcmData);
            }

            return res.status(200).json({ status: 'notified' });
        }

        if (type === 'UPDATE' && record.status !== old_record?.status) {
            const newStatus = record.status;
            const displayId = record.display_code || record.id;
            const driverId = record.driver_id;

            console.log(`[Webhook] Order #${displayId} status change: ${old_record?.status} → ${newStatus}`);

            // --- Notify ALL drivers when order becomes Ready for Pickup ---
            if (newStatus === 'Ready for Pickup' && !driverId) {
                try {
                    const { data: drivers } = await supabase.from('profiles').select('fcm_token').eq('role', 'driver');
                    const driverTokens = (drivers || []).map(d => d.fcm_token).filter(Boolean);
                    for (const token of driverTokens) {
                        await sendFcmNotification(token, "Order Ready for Pickup", `Order #${displayId} is ready and needs a driver!`, fcmData);
                    }
                    console.log(`[Webhook] Notified ${driverTokens.length} drivers of ready order #${displayId}`);
                } catch (driverErr) {
                    console.error('[Webhook] Driver notification error:', driverErr.message);
                }
            }

            // --- Driver-specific Notifications (for assigned driver) ---
            if (driverId) {
                try {
                    const { data: driverProfile } = await supabase.from('profiles').select('fcm_token').eq('id', driverId).single();
                    if (driverProfile?.fcm_token) {
                        if (newStatus === 'Driver Assigned') {
                            await sendFcmNotification(driverProfile.fcm_token, "Order Claimed", `You've claimed Order #${displayId}. Head to the restaurant!`, fcmData);
                        }
                    }
                } catch (driverErr) {
                    console.error(`[Webhook] Driver FCM error (${driverId}):`, driverErr.message);
                }
            }

            // --- Customer Notifications ---
            try {
                const { data: customerProfile } = await supabase.from('profiles').select('fcm_token').eq('id', record.user_id).single();
                if (customerProfile?.fcm_token) {
                    if (newStatus === 'Accepted') {
                        await sendFcmNotification(customerProfile.fcm_token, "Order Accepted", `Order #${displayId} has been accepted!`, fcmData);
                    } else if (newStatus === 'Preparing') {
                        await sendFcmNotification(customerProfile.fcm_token, "Order Being Prepared", `Order #${displayId} is now being prepared!`, fcmData);
                    } else if (newStatus === 'Driver Assigned') {
                        await sendFcmNotification(customerProfile.fcm_token, "Driver Assigned", `A driver has been assigned to Order #${displayId}!`, fcmData);
                    } else if (newStatus === 'Picked Up') {
                        await sendFcmNotification(customerProfile.fcm_token, "Order Picked Up", `Order #${displayId} has been picked up from the restaurant!`, fcmData);
                    } else if (newStatus === 'On the Way') {
                        await sendFcmNotification(customerProfile.fcm_token, "On the Way", `Order #${displayId} is out for delivery!`, fcmData);
                    } else if (newStatus === 'Delivered') {
                        await sendFcmNotification(customerProfile.fcm_token, "Order Delivered", `Order #${displayId} has been delivered. Enjoy your meal!`, fcmData);
                    } else if (newStatus === 'Cancelled') {
                        await sendFcmNotification(customerProfile.fcm_token, "Order Cancelled", `Order #${displayId} has been cancelled.`, fcmData);
                    } else if (newStatus === 'Rejected') {
                        await sendFcmNotification(customerProfile.fcm_token, "Order Rejected", `Order #${displayId} has been rejected.`, fcmData);
                    }
                }
            } catch (custErr) {
                console.error(`[Webhook] Customer FCM error:`, custErr.message);
            }

            // Telegram notification for cancellation
            if (newStatus === 'Cancelled' && old_record?.status !== 'Cancelled') {
                await notifyCancellation(bot, record.id);
            }

            return res.status(200).json({ status: newStatus });
        }
    }

    if (table === 'chat_messages' && type === 'INSERT') {
        try {
            const { sender_id, receiver_id, message, order_id } = record;
            const { data: receiver } = await supabase.from('profiles').select('fcm_token').eq('id', receiver_id).single();
            if (receiver?.fcm_token) {
                await sendFcmNotification(receiver.fcm_token, "New Message", message, { order_id: String(order_id), type: 'chat' });
            }
        } catch (e) {
            console.error('[Chat Webhook Error]', e.message);
        }
    }
    res.status(204).end();
});

// 6. Review Proxy
app.post('/api/reviews', async (req, res) => {
    const { userId, orderId, rating, comment, fullName } = req.body;
    try {
        const { data, error } = await supabase.from('reviews').insert({
            user_id: userId,
            order_id: orderId,
            rating,
            comment,
            full_name: fullName
        }).select().single();
        if (error) throw error;
        await bot.telegram.sendMessage(process.env.TELEGRAM_ADMIN_ID, `⭐ *New Review: ${rating}/5*\nOrder: #${orderId}\nUser: ${fullName}\n"${comment}"`, { parse_mode: 'Markdown' });
        res.status(200).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. Atomic Order Proxy
app.post('/api/orders', async (req, res) => {
    const { orderData, itemsData } = req.body;
    try {
        const { data, error } = await supabase.rpc('place_order_atomic', { p_order_data: orderData, p_items_data: itemsData });
        if (error) throw error;
        res.status(200).json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. Remind Proxy
app.post('/api/remind', async (req, res) => {
    const { orderId, status } = req.body;
    try {
        const { data: order } = await supabase.from('orders').select('display_code').eq('id', orderId).single();
        const displayId = order ? order.display_code : orderId;
        await bot.telegram.sendMessage(process.env.TELEGRAM_ADMIN_ID, `⚠️ *LATE ORDER #${displayId}*\nStatus: ${status}`, { parse_mode: 'Markdown' });
        res.status(200).json({ success: true });
    } catch (e) { res.status(200).json({ warning: 'Admin notified with delay' }); }
});

// 9. Crash Log Proxy (With Hash-Based Deduplication)
app.post('/api/log', async (req, res) => {
    const { userId, log, type, device, app_type, log_hash } = req.body;

    // 1. Extract Metadata
    const errorMsg = (log || "").split('\n')[0].substring(0, 500); // 500 chars max for message
    const deviceModel = typeof device === 'object' ? device.model : (device || 'Unknown');
    const osVersion = typeof device === 'object' ? device.os : 'N/A';
    const appVersion = typeof device === 'object' ? device.app_version : '1.x';
    const appType = app_type || 'CLIENT'; // Default to 'CLIENT' for backward compatibility
    const hashValue = log_hash || generateFallbackHash(errorMsg, deviceModel);

    try {
        // 2. Check if this crash already exists (by hash + app_type)
        const { data: existing, error: fetchError } = await supabase
            .from('crash_logs')
            .select('id, count, last_seen')
            .eq('log_hash', hashValue)
            .eq('app_type', appType)
            .maybeSingle();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        let crashId, currentCount, isNew;

        if (existing) {
            // 3a. UPDATE existing crash (increment count, update timestamp)
            const newCount = (existing.count || 0) + 1;
            const { error: updateError } = await supabase
                .from('crash_logs')
                .update({
                    count: newCount,
                    last_seen: new Date().toISOString(),
                    user_id: userId // Update to latest user who experienced it
                })
                .eq('id', existing.id);

            if (updateError) throw updateError;

            crashId = existing.id;
            currentCount = newCount;
            isNew = false;
        } else {
            // 3b. INSERT new crash cluster
            const { data: newCrash, error: insertError } = await supabase
                .from('crash_logs')
                .insert({
                    user_id: userId,
                    error_message: errorMsg,
                    error_stack: log,
                    device_model: deviceModel,
                    os_version: osVersion,
                    app_version: appVersion,
                    app_type: appType,
                    log_hash: hashValue,
                    count: 1,
                    last_seen: new Date().toISOString()
                })
                .select('id, count')
                .single();

            if (insertError) throw insertError;

            crashId = newCrash.id;
            currentCount = 1;
            isNew = true;
        }

        // 4. Intelligent Notification (Avoid alert fatigue)
        // Notify on: New Crash OR Thresholds (10, 50, 100, 500)
        // Old Logic: isNew || (currentCount <= 5) || ... -> Too spammy
        const shouldNotify = isNew || [10, 50, 100, 500, 1000].includes(currentCount);

        if (shouldNotify) {
            const emoji = currentCount === 1 ? '🆕' : '🚨';
            const frequency = isNew ? 'First occurrence' : `${currentCount} occurrences`;

            // Format stack trace preview (first 5 lines)
            const stackLines = (log || '').split('\n').slice(0, 5).join('\n');

            const botMsg = `${emoji} *${appType} APP ${type || 'CRASH'}*\n\n` +
                `*Error:* \`${errorMsg}\`\n` +
                `*Device:* ${deviceModel} (${osVersion})\n` +
                `*App Version:* ${appVersion}\n` +
                `*Frequency:* ${frequency}\n\n` +
                `*Stack Preview:*\n\`\`\`\n${stackLines}\n\`\`\`\n\n` +
                `_Use /getlogs to view all crashes_`;

            await bot.telegram.sendMessage(process.env.TELEGRAM_ADMIN_ID, botMsg, { parse_mode: 'Markdown' });
        }

        // 5. Legacy Storage Fallback (Keep as archive)
        const fileName = `crash_${appType}_${userId}_${Date.now()}.txt`;
        await supabase.storage.from('logs').upload(fileName, `Type: ${type}\nDevice: ${JSON.stringify(device)}\nApp: ${appType}\n\n${log}`);

        res.status(200).json({ success: true, cluster_id: crashId, count: currentCount, is_new: isNew });
    } catch (e) {
        console.error('[Telemetry Error]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Helper function for backward compatibility
function generateFallbackHash(errorMsg, deviceModel) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(`${deviceModel}|${errorMsg}`).digest('hex');
}

// 10. Realtime Config
app.get('/api/realtime-config', (req, res) => {
    res.status(200).json({
        url: process.env.SUPABASE_URL.replace('https://', 'wss://') + '/realtime/v1/websocket',
        apikey: process.env.SUPABASE_ANON_KEY
    });
});

// 11. Generic Proxy (Zero-Key)
app.all(/^\/api\/proxy\/(.*)/, async (req, res) => {
    const proxyPath = req.params[0];
    const allowed = ['rest/v1/', 'auth/v1/', 'storage/v1/'];
    if (!allowed.some(p => proxyPath.startsWith(p))) return res.status(403).json({ error: 'Blocked' });

    try {
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length'];

        headers['apikey'] = process.env.SUPABASE_ANON_KEY;
        if (headers['authorization'] === 'Bearer zero-key-mode') delete headers['authorization'];

        // Fix for Storage Ops: Ensure x-upsert is present if PUT
        if (proxyPath.startsWith('storage/v1/object/') && req.method === 'PUT') {
            headers['x-upsert'] = 'true';
        }

        let response = await axios({
            method: req.method,
            url: `${process.env.SUPABASE_URL}/${proxyPath}`,
            data: req.rawBody && req.rawBody.length > 0 ? req.rawBody : undefined,
            params: req.query,
            headers,
            validateStatus: () => true,
            responseType: 'arraybuffer',
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        // JWT Fallback Removed: We MUST return 401 to client so it can refresh the token.
        // If we retry as anon, RLS blocks access and returns empty list (200 OK), 
        // confusing the app and preventing re-authentication.

        Object.keys(response.headers).forEach(k => res.setHeader(k, response.headers[k]));
        res.status(response.status).send(Buffer.from(response.data));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 11. POD Upload & Finalization (Fleet Accountability)
app.post('/api/finalize-pod', async (req, res) => {
    const { orderId, podUrl, signatureUrl } = req.body;
    const authHeader = req.headers.authorization;

    try {
        // Authenticate with the user's token for security
        const client = axios.create({
            baseURL: SUPABASE_URL,
            headers: {
                ...PROXY_HEADERS,
                'Authorization': authHeader
            }
        });

        // [CRITICAL FIX] Use REST RPC call instead of supabase-js client
        // This preserves the user's auth context (auth.uid() = driver's ID)
        const { data } = await client.post('/rest/v1/rpc/finalize_delivery_atomic', {
            p_order_id: orderId,
            p_pod_url: podUrl
        });

        // Parse RPC result
        if (data && data.success === false) {
            return res.status(400).json({ error: data.error || 'Operation failed' });
        }

        // Notify Admin of successful delivery
        let msg = `🏁 *Order #${orderId} Delivered*\n\n`;
        if (podUrl) msg += `📸 Proof of Delivery: [View Image](${podUrl})`;
        else msg += `✅ Delivery confirmed by driver (No Proof Uploaded).`;

        await bot.telegram.sendMessage(process.env.TELEGRAM_ADMIN_ID, msg, { parse_mode: 'Markdown' });

        res.status(200).json(data?.order || { success: true });
    } catch (e) {
        // Handle Axios errors (e.response.data) properly
        const msg = e.response?.data?.message || e.message;
        console.error('[POD Error]', msg);
        res.status(500).json({ error: msg });
    }
});

app.post('/api/upload-pod', async (req, res) => {
    // Note: Mobile app will send raw body or multipart. 
    // For Zero-Key, we proxy the upload to storage.
    const authHeader = req.headers.authorization;
    const { fileName } = req.query;

    try {
        // Re-stream the request body to Supabase Storage
        const response = await axios({
            method: 'POST',
            url: `${SUPABASE_URL}/storage/v1/object/pod_proofs/${fileName}`,
            data: req, // Pipe the Express request stream
            headers: {
                ...PROXY_HEADERS,
                'Authorization': authHeader,
                'Content-Type': req.headers['content-type']
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        res.status(response.status).json(response.data);
    } catch (e) {
        console.error('[Upload Error]', e.response?.data || e.message);
        res.status(e.response?.status || 500).json(e.response?.data || { error: e.message });
    }
});

// 12. Global Error Handler (Stability Priority)
app.use((err, req, res, next) => {
    console.error(`[Server Error] ${req.method} ${req.path}`, err.stack);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong on our end.'
    });
});

// Export the Express App
module.exports = app;
