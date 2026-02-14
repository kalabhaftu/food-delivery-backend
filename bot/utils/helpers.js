const axios = require('axios');
const supabase = require('../config/supabase');

// Helper for resilient Supabase updates (handles network blips)
const resilientUpdate = async (table, filter, updateData) => {
    try {
        const { error } = await supabase.from(table).update(updateData).match(filter);
        if (!error) return { success: true };

        // If it's a known non-fetch error (e.g., DB constraint), return immediately
        if (error.message && !error.message.includes('fetch failed')) {
            return { success: false, error: error.message };
        }
        throw error;
    } catch (e) {
        console.warn('⚠️ Potential network blip during update, checking state...', e.message);

        // Fast Check: Maybe it succeeded despite the fetch error?
        const { data, error: fetchError } = await supabase.from(table).select('*').match(filter).single();

        if (!fetchError && data) {
            let isVerified = true;
            for (let key in updateData) {
                if (data[key] !== updateData[key]) {
                    isVerified = false;
                    break;
                }
            }
            if (isVerified) {
                console.log('✅ Verified: Update succeeded despite exception.');
                return { success: true };
            }
        }

        // If not verified immediately, wait briefly and try once more (only if was a fetch fail)
        if (e.message?.includes('fetch failed')) {
            await new Promise(r => setTimeout(r, 800));
            const { data: secondData } = await supabase.from(table).select('*').match(filter).single();
            if (secondData) {
                for (let key in updateData) {
                    if (secondData[key] !== updateData[key]) return { success: false, error: 'Update Failed' };
                }
                return { success: true };
            }
        }

        return { success: false, error: e.message || 'Update failed' };
    }
};

const uploadToSupabase = async (ctx, fileId, fileName) => {
    try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');

        const { data, error } = await supabase.storage
            .from('menu_images')
            .upload(fileName, buffer, { contentType: 'image/png', upsert: true });

        if (error) throw error;

        const { data: publicUrlData } = supabase.storage.from('menu_images').getPublicUrl(fileName);
        return publicUrlData.publicUrl;
    } catch (e) {
        console.error('Upload error:', e);
        return null;
    }
};

module.exports = { resilientUpdate, uploadToSupabase };
