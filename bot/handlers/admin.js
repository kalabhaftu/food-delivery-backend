const supabase = require('../config/supabase');

const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

const listItems = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    try {
        const { data: items, error } = await supabase.from('menu_items').select('*').order('id', { ascending: true });
        if (error) throw error;
        if (!items || items.length === 0) return ctx.reply('No items found. 📭');

        await ctx.reply("📜 *Menu Items Loading...*", { parse_mode: 'Markdown' });

        // Group items to avoid spamming 1 message per item (Telegram TOS / Rate Limits)
        const chunkSize = 5;
        for (let i = 0; i < items.length; i += chunkSize) {
            const chunk = items.slice(i, i + chunkSize);
            let message = "";
            const inline_keyboard = [];

            chunk.forEach(item => {
                message += `🔹 *#${item.id} ${item.title}* - ${item.price} ETB\n   _${item.category || 'No Category'}_\n\n`;
                inline_keyboard.push([
                    { text: `✏️ Edit #${item.id}`, callback_data: `edit_item_${item.id}` },
                    { text: `🗑️ Delete #${item.id}`, callback_data: `delete_item_${item.id}` }
                ]);
            });

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard }
            });
        }

        await ctx.reply("✅ End of Menu.");

    } catch (e) {
        console.error('List error:', e);
        ctx.reply('❌ Error listing items.');
    }
};

const handleQueue = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    try {
        const { data: orders, error } = await supabase
            .from('orders')
            .select('id, status, display_code')
            .not('status', 'in', '("Delivered","Cancelled","Rejected")')
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!orders || orders.length === 0) {
            return ctx.reply('No active orders in queue. 📭');
        }

        let queueMsg = "📋 *Active Order Queue*\n\n";
        const inline_keyboard = [];
        orders.forEach((o) => {
            const displayCode = o.display_code || 'N/A';
            const globalId = o.id;
            queueMsg += `#${displayCode} (ID: ${globalId}) - *${o.status}*\n`;
            inline_keyboard.push([{ text: `⚙️ Manage #${displayCode} (ID: ${globalId})`, callback_data: `view_order_${o.id}` }]);
        });
        inline_keyboard.push([{ text: '🔄 Refresh Queue', callback_data: 'admin_queue' }]);

        await ctx.reply(queueMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });

    } catch (e) {
        console.error('Queue error:', e);
        ctx.reply('❌ Failed to fetch queue.');
    }
};

const getStats = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const last7Days = new Date();
        last7Days.setDate(last7Days.getDate() - 7);
        last7Days.setHours(0, 0, 0, 0);

        const { data: orders, error } = await supabase
            .from('orders')
            .select('total_amount, created_at, status')
            .gte('created_at', last7Days.toISOString());

        if (error) throw error;

        const dailyOrders = orders.filter(o => new Date(o.created_at) >= today);
        const dailyCount = dailyOrders.length;
        const dailyRevenue = dailyOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

        const weeklyRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
        const weeklyCount = orders.length;

        let statusBreakdown = "";
        const statuses = ['Placed', 'Accepted', 'Preparing', 'Ready for Pickup', 'Driver Assigned', 'Picked Up', 'On the Way', 'Delivered'];
        statuses.forEach(s => {
            const count = dailyOrders.filter(o => o.status === s).length;
            if (count > 0) statusBreakdown += `   • ${s}: ${count}\n`;
        });

        const msg = `📊 *Production Analytics Dashboard*\n\n` +
            `📅 *Today:* ${dailyCount} orders\n` +
            `💰 *Today's Revenue:* ${dailyRevenue.toFixed(2)} ETB\n\n` +
            `🗓 *Last 7 Days:* ${weeklyCount} orders\n` +
            `📈 *Weekly Revenue:* ${weeklyRevenue.toFixed(2)} ETB\n\n` +
            `📋 *Today's Breakdown:*\n${statusBreakdown || '   _No active orders_'}\n\n` +
            `🕒 _Refreshed: ${new Date().toLocaleTimeString()}_`;

        await ctx.reply(msg, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error('Stats error:', e);
        ctx.reply('❌ Failed to fetch production statistics.');
    }
};

const listReviews = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    try {
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(15);

        if (error) throw error;
        if (!reviews || reviews.length === 0) return ctx.reply('📭 No reviews found yet.');

        let message = '⭐ *Customer Feedback (Last 15)*\n\n';
        reviews.forEach(rv => {
            const stars = '⭐'.repeat(rv.rating) || 'None';
            const date = new Date(rv.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            message += `👤 *${rv.full_name || 'Anonymous'}* - ${date}\n`;
            message += `${stars}\n`;
            if (rv.comment) message += `💬 _${rv.comment}_\n`;
            message += '───────────────────\n';
        });

        return ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Reviews error:', e);
        ctx.reply('❌ Failed to fetch reviews.');
    }
};

const getLogs = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    try {
        // Fetch top 15 most frequent/recent clusters
        const { data: logs, error } = await supabase
            .from('crash_logs')
            .select('*')
            .order('count', { ascending: false })
            .order('last_seen', { ascending: false })
            .limit(15);

        if (error) throw error;
        if (!logs || logs.length === 0) return ctx.reply('📭 No crash logs found.');

        let message = "🐞 *Crash Telemetry Dashboard*\n\n";
        const inline_keyboard = [];

        logs.forEach((log, index) => {
            const lastSeen = new Date(log.last_seen).toLocaleString();
            const appIcon = log.app_type === 'DRIVER' ? '🚗' : '📱';
            const appLabel = log.app_type || 'CLIENT';

            message += `${appIcon} *#${index + 1} ${appLabel} (${log.count}x)*\n`;
            message += `⚠️ \`${log.error_message}\`\n`;
            message += `📱 ${log.device_model} (v${log.app_version})\n`;
            message += `📅 Last: ${lastSeen}\n\n`;

            inline_keyboard.push([{ text: `🔍 Details #${index + 1}`, callback_data: `LOG_DETAILS_${log.id}` }]);
        });

        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard } });

    } catch (e) {
        console.error('GetLogs error:', e);
        ctx.reply('❌ Failed to fetch telemetry from database.');
    }
};

const setDeliveryFee = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    const args = ctx.message.text.trim().split(/\s+/);
    if (args.length < 2) {
        return ctx.reply('⚠️ Usage: `/setfee [amount]`\nExample: `/setfee 35.0`', { parse_mode: 'Markdown' });
    }

    const newFee = parseFloat(args[1]);
    if (isNaN(newFee) || newFee < 0) {
        return ctx.reply('❌ Invalid amount. Please enter a positive number.');
    }

    try {
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key: 'delivery_fee', value: newFee.toString() });

        if (error) throw error;

        await ctx.reply(`✅ **Delivery Fee Updated!**\n\nNew Fee: **${newFee} ETB**`, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error('SetFee error:', e);
        ctx.reply('❌ Failed to update delivery fee.');
    }
};

const showHelp = (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    try {
        const commandsMeta = require('../config/commands.json');

        let helpMsg = "🛠 *Admin Control Panel*\n\n";

        // Group by category
        const categories = {};
        Object.values(commandsMeta).forEach(cmd => {
            if (!categories[cmd.category]) categories[cmd.category] = [];
            categories[cmd.category].push(cmd);
        });

        for (const [category, cmds] of Object.entries(categories)) {
            helpMsg += `*${category}:*\n`;
            cmds.forEach(cmd => {
                helpMsg += `${cmd.help_display_text} 👉 ${cmd.command}\n`;
            });
            helpMsg += "\n";
        }

        ctx.reply(helpMsg, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('Help Init Error:', err);
        ctx.reply('❌ Error generating help menu.');
    }
};

const getHealthMonitoring = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    try {
        const start = Date.now();

        // 1. Connection & Ping Test
        const { data: ping, error: pingError } = await supabase.from('app_settings').select('key').limit(1);
        const latency = Date.now() - start;

        if (pingError) throw pingError;

        // 2. Slow Query / Bloat Analysis (Simulated for Supabase REST, but we can check connection count via RPC if implemented)
        // For now, we perform a basic count check as a health indicator
        const { count: activeOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).not('status', 'in', '("Delivered","Cancelled")');

        const healthMsg = `🏥 *System Health Report*\n\n` +
            `🟢 *Postgres:* Connected\n` +
            `⏱️ *Latency:* ${latency}ms\n` +
            `📦 *Active Orders:* ${activeOrders}\n` +
            `🚀 *Uptime:* Fully Operational\n\n` +
            `_Check /getlogs for app-level crashes_`;

        await ctx.reply(healthMsg, { parse_mode: 'Markdown' });

    } catch (e) {
        console.error('Health check error:', e);
        ctx.reply('🔴 *System Alert: Database unreachable or slow.*\nError: ' + e.message, { parse_mode: 'Markdown' });
    }
};

async function listDrivers(ctx) {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    try {
        const { data: drivers, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'driver')
            .order('updated_at', { ascending: false });

        if (error) throw error;

        if (!drivers || drivers.length === 0) {
            return ctx.reply('📭 No drivers found in the system.');
        }

        let msg = '🛵 *Delivery Staff List*\n\n';
        drivers.forEach(d => {
            const pushStatus = d.fcm_token ? '✅' : '❌';
            const lastSeen = d.updated_at ? new Date(d.updated_at).toLocaleString('en-US', { timeZone: 'Africa/Addis_Ababa' }) : 'Never';

            let trackingLink = '';
            if (d.last_location_json && d.last_location_json.lat && d.last_location_json.lng) {
                trackingLink = `\n📍 [Live Tracking](https://www.google.com/maps/search/?api=1&query=${d.last_location_json.lat},${d.last_location_json.lng})`;
            }

            msg += `*${d.full_name || 'Unnamed Driver'}*\n`;
            msg += `   📱 Phone: ${d.phone_number || 'N/A'}\n`;
            msg += `   🔔 Push: ${pushStatus}\n`;
            msg += `   🕒 Seen: ${lastSeen}${trackingLink}\n\n`;
        });

        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('ListDrivers Error:', err.message);
        ctx.reply('❌ Failed to fetch driver list.');
    }
}

const toggleService = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    try {
        const { data: current } = await supabase.from('app_settings').select('value').eq('key', 'service_enabled').single();
        const newState = current?.value === 'false' ? 'true' : 'false';

        await supabase.from('app_settings').upsert({ key: 'service_enabled', value: newState });

        ctx.reply(`🛎 *Service Status Updated*\n\nNew Status: ${newState === 'true' ? '✅ OPEN' : '🛑 CLOSED'}`, { parse_mode: 'Markdown' });
    } catch (e) {
        ctx.reply('❌ Failed to toggle service.');
    }
};

const broadcastMessage = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const msg = ctx.message.text.split('/broadcast ')[1];
    if (!msg) return ctx.reply('⚠️ Usage: `/broadcast [message]`');

    try {
        const { data: tokens, error } = await supabase.from('profiles').select('fcm_token').not('fcm_token', 'is', null);
        if (error) throw error;

        const count = tokens.length;
        ctx.reply(`📢 *Broadcast Started*\n\nSending to ${count} users...\nMessage: _${msg}_`, { parse_mode: 'Markdown' });

        // actual FCM broadcast
        const { sendMulticast } = require('../utils/push');
        if (tokens.length > 0) {
            const tokenList = tokens.map(t => t.fcm_token);
            await sendMulticast(tokenList, "📢 System Announcement", msg);
            ctx.reply(`✅ Broadcast Sent!`);
        } else {
            ctx.reply('⚠️ No devices found to broadcast to.');
        }

    } catch (e) {
        ctx.reply('❌ Broadcast failed.');
    }
};

const getDriverPerformance = async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    try {
        const { data: stats, error } = await supabase
            .from('orders')
            .select('driver_id, total_amount, profiles!driver_id(full_name)')
            .eq('status', 'Delivered');

        if (error) throw error;
        if (!stats || stats.length === 0) return ctx.reply('📭 No delivery data available yet.');

        const performance = {};
        stats.forEach(s => {
            if (!s.driver_id) return;
            if (!performance[s.driver_id]) {
                performance[s.driver_id] = { name: s.profiles?.full_name || 'Unknown', count: 0, revenue: 0 };
            }
            performance[s.driver_id].count++;
            performance[s.driver_id].revenue += Number(s.total_amount);
        });

        const sorted = Object.values(performance).sort((a, b) => b.revenue - a.revenue);

        let msg = '🏆 *Driver Performance Leaderboard*\n\n';
        sorted.forEach((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🛵';
            msg += `${medal} *${p.name}*\n`;
            msg += `   📦 Deliveries: ${p.count}\n`;
            msg += `   💰 Revenue: ${p.revenue.toFixed(2)} ETB\n\n`;
        });

        ctx.reply(msg, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error('Performance error:', e);
        ctx.reply('❌ Failed to fetch performance stats.');
    }
};

module.exports = { listItems, handleQueue, getStats, listReviews, getLogs, setDeliveryFee, showHelp, listDrivers, getHealthMonitoring, toggleService, broadcastMessage, getDriverPerformance };
