const { Scenes } = require('telegraf');
const supabase = require('../config/supabase');
const { resilientUpdate } = require('../utils/helpers');
const { sendMainMenu } = require('../utils/keyboard');

const acceptOrderScene = new Scenes.WizardScene(
    'ACCEPT_ORDER_SCENE',
    (ctx) => {
        const orderId = ctx.wizard.state.orderId;
        ctx.reply(`👨‍🍳 *Accepting Order #${orderId}*\n\nSelect preparation time (minutes) or type custom:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['15', '20', '30'], ['45', '60', 'Cancel']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return;

        // Guard: Check for Main Menu commands
        if (['📋 Active Queue', '📜 List Menu', '➕ Add Food Item', '💳 Payment Settings'].some(cmd => ctx.message.text.includes(cmd))) {
            ctx.reply('⚠️ Action cancelled. Returning to menu...');
            ctx.scene.leave();
            // We can't easily jump to the handler, but at least we don't treat "Active Queue" as time.
            // Best to just re-send menu.
            return sendMainMenu(ctx);
        }

        if (ctx.message.text?.toLowerCase() === 'cancel') {
            ctx.reply('Acceptance cancelled. ❌');
            sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const time = parseInt(ctx.message.text);
        if (isNaN(time)) {
            ctx.reply('⚠️ Please enter a valid number of minutes (e.g., 20), or type "cancel":');
            return;
        }
        const orderId = ctx.wizard.state.orderId;
        const statusMsg = await ctx.reply('⏳ *Processing Order Acceptance...*', { parse_mode: 'Markdown' });

        // Atomic update with concurrency check: Only update if status is Pending or Validating
        const { data, error } = await supabase
            .from('orders')
            .update({
                status: 'Accepted',
                estimated_time: time,
                accepted_at: new Date().toISOString(),
                admin_notes: 'Payment confirmed. Order accepted.'
            })
            .eq('id', orderId)
            .in('status', ['Placed'])
            .select()
            .single();

        if (data) {
            // Success
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `✅ *Order #${orderId} Accepted!*\nEstimated time: ${time} mins.\nThe customer has been notified.`, { parse_mode: 'Markdown' });
            sendMainMenu(ctx);
        } else {
            // Failed (likely race condition or already processed)
            const failReason = error ? error.message : 'Order state changed or not found.';
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ *Update Failed:* ${failReason}\nThe order might have been cancelled or accepted by another admin.`, { parse_mode: 'Markdown' });
        }
        return ctx.scene.leave();
    }
);

module.exports = acceptOrderScene;
