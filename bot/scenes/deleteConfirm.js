const { Scenes } = require('telegraf');
const supabase = require('../config/supabase');
const { sendMainMenu } = require('../utils/keyboard');

const deleteConfirmScene = new Scenes.WizardScene(
    'DELETE_CONFIRM_SCENE',
    async (ctx) => {
        const itemId = ctx.wizard.state.itemId;
        try {
            const { data: item, error } = await supabase.from('menu_items').select('title').eq('id', itemId).single();
            if (error || !item) {
                ctx.reply(`❌ Item #${itemId} not found.`);
                return ctx.scene.leave();
            }

            ctx.wizard.state.itemName = item.title;
            await ctx.reply(`⚠️ *Confirm Deletion*\n\nAre you sure you want to delete "${item.title}"? This action cannot be undone.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "✅ Yes, Delete", callback_data: "confirm_delete_yes" },
                            { text: "❌ No, Cancel", callback_data: "confirm_delete_no" }
                        ]
                    ]
                }
            });
            return ctx.wizard.next();
        } catch (e) {
            console.error('Delete check error:', e);
            ctx.reply('❌ Error fetching item details.');
            return ctx.scene.leave();
        }
    },
    async (ctx) => {
        if (!ctx.callbackQuery) {
            ctx.reply('Please use the buttons above to confirm or cancel:');
            return;
        }

        const action = ctx.callbackQuery.data;
        const itemId = ctx.wizard.state.itemId;
        const itemName = ctx.wizard.state.itemName;

        if (action === 'confirm_delete_yes') {
            const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
            if (error) {
                await ctx.answerCbQuery('❌ Failed to delete');
                await ctx.reply(`❌ Error deleting ${itemName}: ${error.message}`);
            } else {
                await ctx.answerCbQuery('🗑️ Item deleted');
                await ctx.reply(`🗑️ *"${itemName}"* has been removed from the menu.`, { parse_mode: 'Markdown' });
            }
        } else {
            await ctx.answerCbQuery('Action cancelled');
            await ctx.reply('Deletion cancelled. 😌');
        }

        sendMainMenu(ctx);
        return ctx.scene.leave();
    }
);

module.exports = deleteConfirmScene;
