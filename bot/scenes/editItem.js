const { Scenes } = require('telegraf');
const supabase = require('../config/supabase');
const { uploadToSupabase } = require('../utils/helpers');
const { sendMainMenu } = require('../utils/keyboard');

const editItemScene = new Scenes.WizardScene(
    'EDIT_ITEM_SCENE',
    async (ctx) => {
        const itemId = ctx.wizard.state.itemId;
        const { data, error } = await supabase.from('menu_items').select('*').eq('id', itemId).single();
        if (error || !data) {
            ctx.reply('❌ Item not found.');
            return ctx.scene.leave();
        }
        ctx.wizard.state.item = data;
        ctx.reply(`📝 *Editing: ${data.title}*\n\n[Step 1/5] Enter new *Name* (or type "skip"):`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['skip'], ['Cancel']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('Edit cancelled. ❌');
            if (typeof sendMainMenu === 'function') sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const newName = ctx.message.text?.toLowerCase() === 'skip' ? ctx.wizard.state.item.title : ctx.message.text;
        ctx.wizard.state.newTitle = newName;
        ctx.reply(`💰 [Step 2/5] Enter new *Price* (or type "skip"):`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['skip'], ['Cancel']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('Edit cancelled. ❌');
            if (typeof sendMainMenu === 'function') sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const newPrice = ctx.message.text?.toLowerCase() === 'skip' ? ctx.wizard.state.item.price : parseFloat(ctx.message.text);
        if (isNaN(newPrice)) {
            ctx.reply('⚠️ Please enter a valid number for price (or type "skip"/"cancel"):');
            return;
        }
        ctx.wizard.state.newPrice = newPrice;
        ctx.reply(`📝 [Step 3/5] Enter new *Description* (or type "skip"):`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['skip'], ['Cancel']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('Edit cancelled. ❌');
            if (typeof sendMainMenu === 'function') sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const newDesc = ctx.message.text?.toLowerCase() === 'skip' ? ctx.wizard.state.item.description : ctx.message.text;
        ctx.wizard.state.newDescription = newDesc;
        ctx.reply(`🗂️ [Step 4/5] Enter new *Category* (or type "skip"):`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['skip'], ['Cancel']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('Edit cancelled. ❌');
            if (typeof sendMainMenu === 'function') sendMainMenu(ctx);
            return ctx.scene.leave();
        }
        const newCat = ctx.message.text?.toLowerCase() === 'skip' ? ctx.wizard.state.item.category : ctx.message.text;
        ctx.wizard.state.newCategory = newCat;
        ctx.reply(`📸 [Step 5/5] Upload new *Photo* (or type "skip"):`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['skip'], ['Cancel']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message.text?.toLowerCase() === 'cancel') {
            await ctx.reply('Edit cancelled. ❌');
            if (typeof sendMainMenu === 'function') sendMainMenu(ctx);
            return ctx.scene.leave();
        }

        let imageUrl = ctx.wizard.state.item.image_url;
        if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const fileName = `item_edit_${Date.now()}.png`;
            ctx.reply('⏳ Uploading new image...');
            imageUrl = await uploadToSupabase(ctx, photo.file_id, fileName);
        }

        const { newTitle, newPrice, newDescription, newCategory } = ctx.wizard.state;
        const itemId = ctx.wizard.state.itemId;

        const { error } = await supabase.from('menu_items')
            .update({
                title: newTitle,
                price: newPrice,
                description: newDescription,
                category: newCategory,
                image_url: imageUrl
            })
            .eq('id', itemId);

        if (error) {
            ctx.reply('❌ Update failed: ' + error.message);
        } else {
            ctx.reply(`✅ *Item Updated Successfully!*`, { parse_mode: 'Markdown' });
            sendMainMenu(ctx);
        }
        return ctx.scene.leave();
    }
);

module.exports = editItemScene;
