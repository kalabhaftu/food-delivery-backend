const { Scenes } = require('telegraf');
const supabase = require('../config/supabase');
const { resilientUpdate } = require('../utils/helpers');
const { sendPushToUser } = require('../utils/push');
const { sendMainMenu } = require('../utils/keyboard');

const rejectOrderScene = new Scenes.WizardScene(
    'REJECT_ORDER_SCENE',
    (ctx) => {
        const orderId = ctx.wizard.state.orderId;
        ctx.reply(`❌ *Rejecting Order #${orderId}*\n\nSelect a reason or type custom:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['Out of Stock', 'Kitchen Busy'],
                    ['Closing Soon', 'Rider Unavailable'],
                    ['Cancel']
                ],
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
            return sendMainMenu(ctx);
        }

        if (ctx.message.text?.toLowerCase() === 'cancel') {
            ctx.reply('Rejection cancelled. ❌');
            sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const reason = ctx.message.text;
        const orderId = ctx.wizard.state.orderId;

        if (!orderId) {
            ctx.reply('❌ Error: Order ID lost. Please try again from the queue.');
            return ctx.scene.leave();
        }

        const statusMsg = await ctx.reply('⏳ *Processing Rejection...*', { parse_mode: 'Markdown' });

        // Atomic update with status check to avoid race conditions
        const { data, error } = await supabase
            .from('orders')
            .update({
                status: 'Rejected',
                admin_notes: reason
            })
            .eq('id', orderId)
            .not('status', 'in', '("Delivered","Cancelled","Rejected")')
            .select();

        if (!error && data && data.length > 0) {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ *Order #${orderId} Rejected.*\nReason: ${reason}\nThe customer has been notified.`, { parse_mode: 'Markdown' });

            // FCM: Notify Customer
            const { data: order } = await supabase.from('orders').select('user_id').eq('id', orderId).single();
            if (order && order.user_id) {
                await sendPushToUser(order.user_id, "Order Rejected", `Sorry, your order #${orderId} was rejected: ${reason}`);
            }

            sendMainMenu(ctx);
        } else {
            const errorMsg = error ? error.message : "Order already processed (Delivered/Cancelled/Rejected)";
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, `❌ *Update Failed:* ${errorMsg}\nPlease try again.`, { parse_mode: 'Markdown' });
        }
        return ctx.scene.leave();
    }
);

module.exports = rejectOrderScene;
