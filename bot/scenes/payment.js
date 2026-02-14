const { Scenes } = require('telegraf');
const supabase = require('../config/supabase');
const { sendMainMenu } = require('../utils/keyboard');

const addPaymentMethodScene = new Scenes.WizardScene(
    'ADD_PAYMENT_METHOD_SCENE',
    (ctx) => {
        ctx.reply('➕ *[Step 1/2] Adding Payment Method*\n\nPlease enter the *Name* of the payment method (e.g., CBE Birr, Telebirr):', {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['❌ Cancel']],
                resize_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        ctx.wizard.state.name = ctx.message.text;
        ctx.reply(`📝 *[Step 2/2] Name: ${ctx.wizard.state.name}*\n\nNow enter the *Details* (Account number, Account Name, etc.) that the user should see:`, { parse_mode: 'Markdown' });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const { name } = ctx.wizard.state;
        const details = ctx.message.text;
        const { error } = await supabase.from('payment_methods').insert([{ name, details }]);
        if (error) {
            ctx.reply('❌ Error saving: ' + error.message);
        } else {
            ctx.reply(`✅ *Success!* Payment method "${name}" has been added and is now active.`, { parse_mode: 'Markdown' });
            sendMainMenu(ctx);
        }
        return ctx.scene.leave();
    }
);

const managePaymentsScene = new Scenes.WizardScene(
    'MANAGE_PAYMENTS_SCENE',
    async (ctx) => {
        const { data, error } = await supabase.from('payment_methods').select('*').eq('is_active', true);

        let list = "💳 *Payment Methods*\n\n";
        if (!data || data.length === 0) {
            list += "_No active methods found._\n";
        } else {
            data.forEach(m => list += `▫️ *${m.name}:* \`${m.details}\`\n`);
        }

        await ctx.reply(list + "\nType the *Name* of a method to *Delete* it, or use the buttons below:", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Add New Method', callback_data: 'admin_add_payment' }],
                    [{ text: '❌ Cancel', callback_data: 'admin_cancel_payment' }]
                ]
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        // Guard: If this is a callback query, it's handled by the .action() below, not here.
        if (!ctx.message || !ctx.message.text) {
            return; // Ignore non-text updates (like callback queries)
        }

        if (ctx.message.text.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }

        const nameToDelete = ctx.message.text;
        const { data: deleted, error } = await supabase.from('payment_methods').delete().eq('name', nameToDelete).select();

        if (error) {
            ctx.reply('❌ Failed to delete method.');
        } else if (!deleted || deleted.length === 0) {
            ctx.reply(`⚠️ Method "${nameToDelete}" not found.`);
        } else {
            ctx.reply(`✅ Method *${nameToDelete}* removed.`, { parse_mode: 'Markdown' });
            await sendMainMenu(ctx);
        }
        return ctx.scene.leave();
    }
);

// Inline Button Handlers for managePaymentsScene
managePaymentsScene.action('admin_cancel_payment', async (ctx) => {
    await ctx.answerCbQuery('Cancelled');
    await ctx.reply('Action cancelled. ❌');
    await sendMainMenu(ctx);
    return ctx.scene.leave();
});

managePaymentsScene.action('admin_add_payment', async (ctx) => {
    await ctx.answerCbQuery('Opening Add Payment...');
    await ctx.scene.leave();
    return ctx.scene.enter('ADD_PAYMENT_METHOD_SCENE');
});

module.exports = { addPaymentMethodScene, managePaymentsScene };
