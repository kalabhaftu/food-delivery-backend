const supabase = require('../config/supabase');
const { resilientUpdate } = require('../utils/helpers');
const { sendPushToUser, sendPushToDrivers } = require('../utils/push');

const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

/**
 * Download file from a URL directly using fetch with retry logic
 * The payments bucket is public, so we bypass Supabase SDK which returns empty buffers
 * @param {string} url - Full public URL to download
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Buffer>} - File buffer
 */
/**
 * Validates that a buffer contains a valid JPEG image
 * JPEG files start with magic bytes: FF D8 FF
 */
const isValidJpeg = (buffer) => {
    if (!buffer || buffer.length < 3) return false;
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
};

/**
 * Validates that a buffer contains a valid PNG image
 * PNG files start with: 89 50 4E 47
 */
const isValidPng = (buffer) => {
    if (!buffer || buffer.length < 4) return false;
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
};

const downloadWithRetry = async (url, maxRetries = 4) => {
    const delays = [0, 1000, 2000, 4000]; // 0ms, 1s, 2s, 4s

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (delays[attempt] > 0) {
            console.log(`[Storage] Retry ${attempt}/${maxRetries - 1}: Waiting ${delays[attempt]}ms before next attempt...`);
            await new Promise(r => setTimeout(r, delays[attempt]));
        }

        try {
            console.log(`[Storage] Attempt ${attempt + 1}/${maxRetries}: Fetching ${url}`);
            const response = await fetch(url);

            if (!response.ok) {
                console.warn(`[Storage] Attempt ${attempt + 1}/${maxRetries} failed: HTTP ${response.status}`);
                if (attempt === maxRetries - 1) throw new Error(`HTTP ${response.status}`);
                continue;
            }

            const contentType = response.headers.get('content-type') || 'unknown';
            console.log(`[Storage] Response Content-Type: ${contentType}`);

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (!buffer || buffer.length === 0) {
                console.warn(`[Storage] Attempt ${attempt + 1}/${maxRetries}: Buffer is empty`);
                if (attempt === maxRetries - 1) throw new Error(`Buffer still empty after ${maxRetries} attempts`);
                continue;
            }

            // Validate image magic bytes
            if (!isValidJpeg(buffer) && !isValidPng(buffer)) {
                console.warn(`[Storage] Attempt ${attempt + 1}/${maxRetries}: Buffer (${buffer.length} bytes) is NOT a valid JPEG/PNG. First 4 bytes: ${buffer.slice(0, 4).toString('hex')}`);
                if (attempt === maxRetries - 1) throw new Error(`Downloaded file is not a valid image (first bytes: ${buffer.slice(0, 4).toString('hex')})`);
                continue;
            }

            console.log(`[Storage] Successfully downloaded valid image (${buffer.length} bytes, type: ${isValidJpeg(buffer) ? 'JPEG' : 'PNG'}) on attempt ${attempt + 1}`);
            return buffer;
        } catch (err) {
            console.warn(`[Storage] Attempt ${attempt + 1}/${maxRetries} error:`, err.message);
            if (attempt === maxRetries - 1) throw err;
        }
    }
    throw new Error(`Failed to download after ${maxRetries} attempts`);
};

const notifyNewOrder = async (ctxOrBot, orderId, isWebhook = false) => {
    try {
        // 1. Fetch Order Basics First (Avoid Join fails)
        const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            console.warn(`[Bot] Order #${orderId} not found in database. (isWebhook: ${isWebhook})`);

            // Only notify admin if NOT a webhook (direct interactive command failure)
            if (!isWebhook) {
                const msg = `❌ Order record not found.`;
                await ctxOrBot.reply(msg);
            }
            return;
        }

        // 2. Fetch Relations (Graceful Fallback & Parallel)
        let profile = null;
        let items = [];

        try {
            const promises = [];

            // Promise 1: Profile
            if (order.user_id) {
                promises.push(
                    supabase.from('profiles').select('*').eq('id', order.user_id).single()
                        .then(({ data }) => data)
                        .catch(() => null)
                );
            } else {
                promises.push(Promise.resolve(null));
            }

            // Promise 2: Items (order_items.order_id is UUID, matches orders.public_id)
            promises.push(
                supabase.from('order_items').select('*, menu_items(title)').eq('order_id', order.public_id)
                    .then(({ data }) => data || [])
                    .catch(() => [])
            );

            const [p, i] = await Promise.all(promises);
            profile = p;
            items = i;

        } catch (err) {
            console.error('Relation Fetch Error:', err);
        }

        // Patch order object for legacy logic
        order.profiles = profile;
        order.order_items = items;

        // Parallel fetch for robustness (Items)
        let itemsList = "No Items??";
        if (order.order_items && order.order_items.length > 0) {
            itemsList = order.order_items.map(i => {
                return `• ${i.quantity}x ${i.menu_items?.title || 'Unknown Item'}`;
            }).join('\n');
        }

        // Format Time
        let orderTime = "Unknown Time";
        if (order.created_at) {
            const date = new Date(order.created_at);
            orderTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Addis_Ababa' });
        }

        const customerName = order.profiles?.full_name || 'Guest';
        const phone = order.profiles?.phone_number || 'No Phone';
        const locationLink = order.delivery_location?.lat ?
            `https://www.google.com/maps/search/?api=1&query=${order.delivery_location.lat},${order.delivery_location.lng}` : null;

        let message = `🔔 *Order #${order.display_code} Update*\n\n` +
            `👤 *Customer:* ${customerName} (${phone})\n` +
            `🕒 *Time:* ${orderTime}\n` +
            `📍 *Location:* ${order.profiles?.address || 'N/A'}\n` +
            `💰 *Total:* ${order.total_amount} ETB\n\n` +
            `🍽️ *Items:*\n${itemsList}\n\n` +
            `📝 *Status:* ${order.status}`;

        // Dynamic Keyboard (Admin Controls)
        const inline_keyboard = [];
        if (order.status === 'Placed') {
            inline_keyboard.push([
                { text: '✅ Accept Order', callback_data: `status_${orderId}_Accepted` },
                { text: '❌ Reject', callback_data: `reject_${orderId}` }
            ]);
        } else if (order.status === 'Accepted') {
            inline_keyboard.push([{ text: '👨‍🍳 Start Preparing', callback_data: `status_${orderId}_Preparing` }]);
        } else if (order.status === 'Preparing') {
            inline_keyboard.push([{ text: '✅ Ready for Pickup', callback_data: `status_${orderId}_Ready for Pickup` }]);
        }

        if (locationLink) {
            inline_keyboard.push([{ text: '📍 View Delivery Location', url: locationLink }]);
        }
        inline_keyboard.push([{ text: '🔄 Refresh Status', callback_data: `view_order_${orderId}` }]);

        if (isWebhook) {
            const sendUpdate = async (attempt = 1) => {
                try {
                    if (order.payment_proof_url) {
                        try {
                            // Enhanced: Support Buffer-based sending with retry for race conditions
                            const rawUrl = order.payment_proof_url;

                            console.log(`[Telegram] Processing payment proof: URL=${rawUrl}`);

                            // Use retry helper with direct fetch (bypasses Supabase SDK empty buffer issue)
                            const buffer = await downloadWithRetry(rawUrl, 4);

                            await ctxOrBot.telegram.sendPhoto(ADMIN_ID, { source: buffer, filename: 'payment.jpg' }, {
                                caption: message,
                                parse_mode: 'Markdown',
                                reply_markup: { inline_keyboard }
                            });
                        } catch (photoErr) {
                            console.error(`[Telegram] Photo send failed (Order #${orderId}), falling back to direct URL or text:`, photoErr.message);
                            // Fallback to URL (original logic)
                            try {
                                await ctxOrBot.telegram.sendPhoto(ADMIN_ID, order.payment_proof_url, {
                                    caption: message,
                                    parse_mode: 'Markdown',
                                    reply_markup: { inline_keyboard }
                                });
                            } catch (urlErr) {
                                await ctxOrBot.telegram.sendMessage(ADMIN_ID, message + "\n\n⚠️ _(Proof photo failed to load)_", {
                                    parse_mode: 'Markdown',
                                    reply_markup: { inline_keyboard }
                                });
                            }
                        }
                    } else {
                        await ctxOrBot.telegram.sendMessage(ADMIN_ID, message, {
                            parse_mode: 'Markdown',
                            reply_markup: { inline_keyboard }
                        });
                    }
                } catch (sendErr) {
                    if (attempt < 3) {
                        console.warn(`⚠️ Notification Attempt ${attempt} failed, retrying in 2s...`);
                        await new Promise(r => setTimeout(r, 2000));
                        return sendUpdate(attempt + 1);
                    }
                    console.error('Final Notification Error:', sendErr);
                }
            };
            await sendUpdate();
        } else {
            // Interactive Mode (ctx)
            if (order.payment_proof_url) {
                try {
                    const rawUrl = order.payment_proof_url;

                    // Use retry helper with direct fetch (bypasses Supabase SDK empty buffer issue)
                    const buffer = await downloadWithRetry(rawUrl, 4);

                    await ctxOrBot.replyWithPhoto({ source: buffer, filename: 'payment.jpg' }, {
                        caption: message,
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard }
                    });
                } catch (photoErr) {
                    console.error(`[Telegram] Reply photo failed (Order #${orderId}), falling back to text:`, photoErr.message);
                    await ctxOrBot.reply(message + "\n\n⚠️ _(Proof photo failed to load)_", {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard }
                    });
                }
            } else {
                await ctxOrBot.reply(message, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard }
                });
            }
        }


    } catch (e) {
        console.error('Notify New Order Error:', e);
        if (isWebhook) await ctxOrBot.telegram.sendMessage(ADMIN_ID, '❌ Error displaying order.');
        else await ctxOrBot.reply('❌ Error displaying order.');
    }
};

const setupCallbacks = (bot, adminHandlerQueue) => {
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        if (ctx.from.id.toString() !== ADMIN_ID) {
            await ctx.answerCbQuery('⛔ Unauthorized Access');
            return;
        }

        try {
            if (data.startsWith('status_')) {
                const [_, orderId, newStatus] = data.split('_');
                const { data: currentOrder } = await supabase.from('orders').select('status').eq('id', orderId).single();
                if (!currentOrder) return ctx.answerCbQuery('Order not found');

                // Admin Action: Accept Order
                if (newStatus === 'Accepted' && currentOrder.status === 'Placed') {
                    await ctx.answerCbQuery();
                    return ctx.scene.enter('ACCEPT_ORDER_SCENE', { orderId });
                }

                // Admin Action: Start Preparing
                if (newStatus === 'Preparing' && currentOrder.status === 'Accepted') {
                    const result = await resilientUpdate('orders', { id: orderId }, { status: newStatus });
                    if (result.success) {
                        await ctx.answerCbQuery(`Now Preparing`);

                        const { data: order } = await supabase.from('orders').select('user_id, display_code').eq('id', orderId).single();
                        if (order && order.user_id) {
                            await sendPushToUser(order.user_id, `Order #${order.display_code} Being Prepared`, `Your food is being prepared!`);
                        }

                        return notifyNewOrder(ctx, orderId);
                    }
                    return ctx.answerCbQuery('Update failed. Try again.');
                }

                // Admin Action: Ready for Pickup
                if (newStatus === 'Ready for Pickup' && currentOrder.status === 'Preparing') {
                    const result = await resilientUpdate('orders', { id: orderId }, { status: newStatus });
                    if (result.success) {
                        await ctx.answerCbQuery(`Updated to ${newStatus}`);

                        // FCM: Notify Customer
                        const { data: order } = await supabase.from('orders').select('user_id, display_code').eq('id', orderId).single();
                        if (order && order.user_id) {
                            await sendPushToUser(order.user_id, `Order #${order.display_code} Ready!`, `Your order is ready for pickup or delivery.`);
                        }

                        return notifyNewOrder(ctx, orderId);
                    }
                }

                await ctx.answerCbQuery('Update Failed');

            } else if (data.startsWith('reject_')) {
                const orderId = data.split('_')[1];
                await ctx.answerCbQuery();
                return ctx.scene.enter('REJECT_ORDER_SCENE', { orderId });

            } else if (data.startsWith('view_order_')) {
                await ctx.answerCbQuery('Fetching...');
                const orderId = data.split('_')[2];
                return notifyNewOrder(ctx, orderId);

            } else if (data === 'admin_queue') {
                await ctx.answerCbQuery('Refreshing...');
                return adminHandlerQueue(ctx);

            } else if (data === 'admin_add_payment') {
                await ctx.answerCbQuery();
                return ctx.scene.enter('ADD_PAYMENT_METHOD_SCENE');
            } else if (data === 'admin_cancel_payment') {
                await ctx.answerCbQuery();
                return ctx.scene.leave();

            } else if (data.startsWith('edit_item_')) {
                const itemId = data.split('_')[2];
                await ctx.answerCbQuery();
                return ctx.scene.enter('EDIT_ITEM_SCENE', { itemId });

            } else if (data.startsWith('delete_item_')) {
                const itemId = data.split('_')[2];
                await ctx.answerCbQuery();
                return ctx.scene.enter('DELETE_CONFIRM_SCENE', { itemId });
                const buffer = Buffer.from(await fileBlob.arrayBuffer());
                await ctx.replyWithDocument({ source: buffer, filename: fileName }, { caption: `📄 Log: ${fileName}` });

            } else if (data.startsWith('LOG_DETAILS_')) {
                const logId = data.split('_')[2];
                await ctx.answerCbQuery('Fetching log file...');

                const { data: log, error } = await supabase
                    .from('crash_logs')
                    .select('*')
                    .eq('id', logId)
                    .single();

                if (error) throw error;
                if (!log) return ctx.reply('❌ Log not found.');

                // Build metadata caption
                const appIcon = log.app_type === 'DRIVER' ? '🚗' : '📱';
                const caption = `${appIcon} *${log.app_type || 'CLIENT'} APP CRASH LOG*\n\n` +
                    `*Error:* \`${log.error_message}\`\n` +
                    `*Device:* ${log.device_model}\n` +
                    `*OS:* ${log.os_version}\n` +
                    `*App Version:* ${log.app_version}\n` +
                    `*Frequency:* ${log.count}x occurrences\n` +
                    `*Last Seen:* ${new Date(log.last_seen).toLocaleString()}\n` +
                    `*User ID:* ${log.user_id || 'Unknown'}\n\n` +
                    `_Full stack trace in attached file_`;

                // Try to find and send the log file from storage
                try {
                    // List files in logs bucket matching this crash
                    const { data: files, error: listError } = await supabase
                        .storage
                        .from('logs')
                        .list('', {
                            limit: 100,
                            sortBy: { column: 'created_at', order: 'desc' }
                        });

                    if (listError) throw listError;

                    // Find the most recent log file for this user/app type
                    const logFile = files?.find(f =>
                        f.name.includes(`crash_${log.app_type}_${log.user_id}`) ||
                        f.name.includes(`crash_${log.user_id}`)
                    );

                    if (logFile) {
                        // Download the file
                        const { data: fileData, error: downloadError } = await supabase
                            .storage
                            .from('logs')
                            .download(logFile.name);

                        if (downloadError) throw downloadError;

                        // Convert Blob to Buffer
                        const buffer = Buffer.from(await fileData.arrayBuffer());

                        // Send as document with caption
                        await ctx.replyWithDocument(
                            { source: buffer, filename: logFile.name },
                            { caption, parse_mode: 'Markdown' }
                        );
                    } else {
                        // No file found, send error_stack from database as text file
                        const logContent = `--- CRASH LOG ---\n` +
                            `Date: ${new Date(log.last_seen).toISOString()}\n` +
                            `App: ${log.app_type}\n` +
                            `Device: ${log.device_model}\n` +
                            `OS: ${log.os_version}\n` +
                            `App Version: ${log.app_version}\n` +
                            `User: ${log.user_id}\n` +
                            `Frequency: ${log.count}x\n\n` +
                            `${log.error_stack}`;

                        const buffer = Buffer.from(logContent, 'utf-8');
                        await ctx.replyWithDocument(
                            { source: buffer, filename: `crash_${log.id}.txt` },
                            { caption, parse_mode: 'Markdown' }
                        );
                    }
                } catch (fileError) {
                    console.error('[LOG_DETAILS] File fetch error:', fileError);
                    // Fallback: Send stack trace as text message
                    const detailMsg = caption + `\n\n*Stack Trace:*\n\`\`\`\n${log.error_stack.substring(0, 3000)}\n\`\`\``;
                    await ctx.reply(detailMsg, { parse_mode: 'Markdown' });
                }

            } else {
                ctx.answerCbQuery();
            }
        } catch (e) {
            console.error('Callback error:', e);
            try {
                await ctx.answerCbQuery('Error processing request');
            } catch (ansErr) { }
        }
    });
};

const notifyCancellation = async (bot, orderId) => {
    try {
        const { data: order } = await supabase.from('orders').select('display_code').eq('id', orderId).single();
        if (!order) {
            console.warn(`[Bot] Cancellation hook: Order record #${orderId} already gone.`);
            return; // Stay silent for webhook-driven cancellations of transient orders
        }
        await bot.telegram.sendMessage(ADMIN_ID, `🚫 *Order #${order.display_code} (ID: ${orderId}) Cancelled* by the user.`, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Notify Cancellation Error:', e);
    }
};

module.exports = { setupCallbacks, notifyNewOrder, notifyCancellation };
