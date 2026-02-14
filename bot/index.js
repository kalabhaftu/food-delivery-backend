const { Telegraf, Scenes, Markup } = require('telegraf');
require('dotenv').config();
const { listItems, handleQueue, getStats, listReviews, getLogs, setDeliveryFee, showHelp, listDrivers, getHealthMonitoring, toggleService, broadcastMessage, getDriverPerformance } = require('./handlers/admin');
const { setupCallbacks, notifyNewOrder, notifyCancellation } = require('./handlers/callbacks');
const supabaseSession = require('./middleware/supabaseSession');
const { sendMainMenu, MAIN_KEYBOARD } = require('./utils/keyboard');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.warn('⚠️ WARNING: TELEGRAM_BOT_TOKEN is missing!');
}

let bot;
try {
    bot = new Telegraf(botToken || 'DUMMY_TOKEN');
} catch (err) {
    console.error('❌ Bot Init Error:', err);
    bot = { handleUpdate: () => console.error('Bot not initialized') };
}

const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

// --- Middleware & Scenes ---
let stage;
try {
    stage = new Scenes.Stage([
        require('./scenes/addItem'),
        require('./scenes/acceptOrder'),
        require('./scenes/rejectOrder'),
        require('./scenes/editItem'),
        require('./scenes/deleteConfirm'),
        require('./scenes/payment').addPaymentMethodScene,
        require('./scenes/payment').managePaymentsScene
    ]);
} catch (err) {
    console.error('❌ Scenes Stage Init Error:', err);
    stage = { middleware: () => (ctx, next) => { console.error('Scenes Stage not initialized'); return next(); } };
}

bot.use(supabaseSession());

// --- Global Admin Security Middleware ---
bot.use(async (ctx, next) => {
    if (ctx.from && ctx.from.id.toString() !== ADMIN_ID) {
        console.warn(`[Security] Unauthorized access attempt by ${ctx.from.id} (${ctx.from.username || 'unknown'})`);
        if (ctx.chat?.type === 'private') {
            await ctx.reply(`⛔ Protected: Admins only.\nYour ID: ${ctx.from.id}`);
        }
        return; // Block
    }
    return next();
});

bot.use(stage.middleware());

// Global Cancel Handlers (MUST be AFTER stage.middleware so ctx.scene exists)
bot.hears('❌ Cancel', async (ctx) => {
    if (ctx.scene) await ctx.scene.leave();
    await ctx.reply('🛑 Operation Cancelled.', { reply_markup: MAIN_KEYBOARD });
});

bot.command('cancel', async (ctx) => {
    if (ctx.scene) await ctx.scene.leave();
    await ctx.reply('🛑 Operation Cancelled.', { reply_markup: MAIN_KEYBOARD });
});

// --- Admin Command Handlers ---
bot.command(['menu', 'items'], (ctx) => listItems(ctx));
bot.command(['queue', 'orders'], (ctx) => handleQueue(ctx));
bot.command('stats', (ctx) => getStats(ctx));
bot.command('setfee', (ctx) => setDeliveryFee(ctx));
bot.command('drivers', listDrivers);
bot.command('getlogs', (ctx) => getLogs(ctx));
bot.command('health', (ctx) => getHealthMonitoring(ctx));
bot.command('reviews', (ctx) => listReviews(ctx));
bot.command('settings', toggleService);
bot.command('broadcast', broadcastMessage);
bot.command('performance', getDriverPerformance);
bot.command('additem', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.scene.enter('ADD_ITEM_SCENE');
});
bot.command('payments', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.scene.enter('MANAGE_PAYMENTS_SCENE');
});

// Help & Documentation
bot.command('help', async (ctx) => {
    await showHelp(ctx);
});

// --- Main Start Command ---
bot.start(async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.reply(`⛔ Protected: Admins only.\nYour ID: ${ctx.from.id}`);
    }
    await ctx.reply(
        "🍱 *Abebe Admin Terminal v6.2*\n\n" +
        "Welcome, Chef. System is fully operational.\n\n" +
        "**Core Commands:**\n" +
        "📦 /queue - Manage Active Orders\n" +
        "📜 /menu - Edit Food Items\n" +
        "⭐ /reviews - Customer Feedback\n" +
        "🐞 /getlogs - System Health\n\n" +
        "Use the *Menu Buttons* below for quick access.",
        {
            parse_mode: 'Markdown',
            reply_markup: MAIN_KEYBOARD
        }
    );
    return handleQueue(ctx);
});

// --- Main Menu Button Handlers ---
bot.hears('📋 Active Queue', handleQueue);
bot.hears('📜 List Menu', listItems);
bot.hears('🛵 Delivery Staff', listDrivers);
bot.hears('➕ Add Food Item', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.scene.enter('ADD_ITEM_SCENE');
});
bot.hears('💳 Payment Settings', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.scene.enter('MANAGE_PAYMENTS_SCENE');
});

// Edit/Delete Regex
bot.hears(/^\/edit_(\d+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const itemId = ctx.match[1];
    await ctx.scene.enter('EDIT_ITEM_SCENE', { itemId });
});

bot.hears(/^\/delete_(\d+)$/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const itemId = ctx.match[1];
    await ctx.scene.enter('DELETE_CONFIRM_SCENE', { itemId });
});

// --- Callback Handlers ---
setupCallbacks(bot, handleQueue);

// --- Launch ---
// bot.launch() removed for Vercel/Webhook compatibility.
// If running locally, uncomment it, but for Vercel it MUST be removed.

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- Catch-All Fallback (Smart Reply) ---
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;

    // Guard: Do not trigger if we are inside a scene 
    // (Telegraf handles scenes, but if we fall through, we check)
    if (ctx.scene && ctx.scene.current) return;

    // If we reached here, no other command/hear matched.
    await ctx.reply("🤖 *Unknown Command*\n\nI didn't quite catch that. Try using /help or select an option from the menu below.", {
        parse_mode: 'Markdown',
        reply_markup: MAIN_KEYBOARD
    });
});

// Webhook Helpers
const { LRUCache } = require('lru-cache');

const processedOrders = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 60 * 24 // 24 hours
});

const processedCancellations = new LRUCache({
    max: 500,
    ttl: 1000 * 60 * 60 * 24 // 24 hours
});
// Redundant require removed

module.exports = { bot, notifyNewOrder, notifyCancellation, processedOrders, processedCancellations };
