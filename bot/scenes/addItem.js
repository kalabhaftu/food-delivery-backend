const { Scenes } = require('telegraf');
const supabase = require('../config/supabase');
const { uploadToSupabase } = require('../utils/helpers');
const { sendMainMenu } = require('../utils/keyboard');

const cancelKeyboard = {
    reply_markup: {
        keyboard: [['❌ Cancel']],
        resize_keyboard: true
    }
};

const addItemScene = new Scenes.WizardScene(
    'ADD_ITEM_SCENE',
    (ctx) => {
        ctx.reply('🛠️ [Step 1/5] Adding New Item\nEnter the *Name* of the food:', {
            parse_mode: 'Markdown',
            ...cancelKeyboard
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        ctx.wizard.state.title = ctx.message.text;
        ctx.reply('💰 [Step 2/5] Enter the *Price* (e.g., 250):', { parse_mode: 'Markdown', ...cancelKeyboard });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const price = parseFloat(ctx.message.text);
        if (isNaN(price)) {
            ctx.reply('⚠️ Please enter a valid number for price (or type cancel):');
            return;
        }
        ctx.wizard.state.price = price;
        ctx.reply('📝 [Step 3/5] Enter a short *Description*:', { parse_mode: 'Markdown', ...cancelKeyboard });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        ctx.wizard.state.description = ctx.message.text;
        ctx.reply('🗂️ [Step 4/5] Enter a *Category* (e.g., Fast Food, Drinks, Dessert):', { parse_mode: 'Markdown', ...cancelKeyboard });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        ctx.wizard.state.category = ctx.message.text;
        ctx.reply('📸 [Step 5/5] Now, upload a *Photo* of the food:', { parse_mode: 'Markdown', ...cancelKeyboard });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (!ctx.message) return;
        if (ctx.message.text?.toLowerCase() === 'cancel' || ctx.message.text === '❌ Cancel') {
            await ctx.reply('Action cancelled. ❌');
            await sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        if (!ctx.message.photo) {
            ctx.reply('⚠️ Please upload a *Photo* of the food to finish, or type "cancel" to stop:', { parse_mode: 'Markdown' });
            return;
        }
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const fileName = `item_${Date.now()}_${photo.file_id.slice(-5)}.png`;

        ctx.reply('⏳ Uploading image and saving item...');
        const imageUrl = await uploadToSupabase(ctx, photo.file_id, fileName);

        if (!imageUrl) {
            ctx.reply('❌ Failed to upload image. Please try again or type "cancel".');
            return;
        }

        const { title, price, description, category } = ctx.wizard.state;
        const { error } = await supabase.from('menu_items').insert([
            { title, price, description, category, image_url: imageUrl }
        ]);

        if (error) {
            ctx.reply('❌ Database error: ' + error.message);
        } else {
            ctx.reply(`✨ *Success!* ${title} added to the menu.`, { parse_mode: 'Markdown' });
            sendMainMenu(ctx);
        }
        return ctx.scene.leave();
    }
);

module.exports = addItemScene;
