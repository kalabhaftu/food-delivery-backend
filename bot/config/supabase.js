const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('⚠️ WARNING: Missing Supabase Environment Variables!');
}

let supabase;
try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn('⚠️ WARNING: Supabase Credentials Missing - Using Mock Client');
        supabase = { from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null, error: 'Mock Client' }) }) }) }) };
    } else {
        supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
} catch (e) {
    console.error('❌ Supabase Init Error:', e);
    supabase = { from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null, error: e.message }) }) }) }) };
}

module.exports = supabase;
