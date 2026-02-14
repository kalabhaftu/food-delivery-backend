// Shared Main Menu Keyboard - Single Source of Truth
// This is the ONLY keyboard the bot should show for the admin

const MAIN_KEYBOARD = {
    keyboard: [
        ['📋 Active Queue', '📜 List Menu'],
        ['➕ Add Food Item', '🛵 Delivery Staff'],
        ['💳 Payment Settings']
    ],
    resize_keyboard: true
};

/**
 * Sends the main admin menu with a consistent keyboard.
 * Use this everywhere instead of defining keyboards locally.
 */
const sendMainMenu = (ctx, message = "🍱 *Abebe Admin Terminal*") => {
    return ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: MAIN_KEYBOARD
    });
};

module.exports = { sendMainMenu, MAIN_KEYBOARD };
