const { createClient } = require('@supabase/supabase-js');
const { Telegraf } = require('telegraf');
require('dotenv').config();

const colors = {
    reset: "\x1b[0m",
    blue: "\x1b[34m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m"
};

async function runDiagnostics() {
    console.clear();
    console.log(`${colors.cyan}===========================================${colors.reset}`);
    console.log(`${colors.cyan}   🔍 SYSTEM DIAGNOSTIC TOOL v2.0   ${colors.reset}`);
    console.log(`${colors.cyan}===========================================${colors.reset}\n`);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // 1. Check Env Vars
    console.log(`${colors.blue}Step 1: Environment Variables${colors.reset}`);
    const requiredVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_ID'];
    let missingVars = [];
    requiredVars.forEach(v => {
        if (!process.env[v]) missingVars.push(v);
    });

    if (missingVars.length > 0) {
        console.log(`${colors.red}✖ Missing: ${missingVars.join(', ')}${colors.reset}`);
    } else {
        console.log(`${colors.green}✔ All required variables present.${colors.reset}`);
    }

    // 2. Check Supabase
    console.log(`\n${colors.blue}Step 2: Supabase Connection & Tables${colors.reset}`);
    if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        try {
            const tables = ['profiles', 'menu_items', 'orders', 'payment_methods', 'app_settings'];
            for (const table of tables) {
                const { error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
                if (error) {
                    console.log(`  ${colors.red}✖ [${table}]: ${error.message}${colors.reset}`);
                } else {
                    console.log(`  ${colors.green}✔ [${table}]: ${count} rows${colors.reset}`);
                }
            }

            // Check Storage
            const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
            if (bucketError) {
                console.log(`  ${colors.red}✖ Storage: ${bucketError.message}${colors.reset}`);
            } else {
                console.log(`  ${colors.green}✔ Storage: ${buckets.length} buckets found (${buckets.map(b => b.name).join(', ') || 'None'})${colors.reset}`);
            }

        } catch (e) {
            console.log(`${colors.red}✖ Connection Failed: ${e.message}${colors.reset}`);
        }
    }

    // 3. Check Telegram Bot
    console.log(`\n${colors.blue}Step 3: Telegram Bot Logic${colors.reset}`);
    if (botToken) {
        const bot = new Telegraf(botToken);
        try {
            const me = await bot.telegram.getMe();
            console.log(`  ${colors.green}✔ Identity: @${me.username} (ID: ${me.id})${colors.reset}`);

            // Check if module loads
            try {
                require('../bot/index.js');
                console.log(`  ${colors.green}✔ Module Load: Syntax OK${colors.reset}`);
            } catch (err) {
                console.log(`  ${colors.red}✖ Module Load: Failed - ${err.message}${colors.reset}`);
            }

        } catch (e) {
            console.log(`  ${colors.red}✖ Connection Failed: ${e.message}${colors.reset}`);
        }
    }

    // 4. Vercel Health
    console.log(`\n${colors.blue}Step 4: Vercel Deployment Health${colors.reset}`);
    const vercelUrl = "https://food-delivery-backend-gilt.vercel.app/api/index";
    try {
        const resp = await fetch(vercelUrl);
        if (resp.ok) {
            console.log(`  ${colors.green}✔ Endpoint Reachable (${resp.status})${colors.reset}`);
        } else {
            console.log(`  ${colors.yellow}⚠ Endpoint Returned ${resp.status} (Expected 200/404 for GET on POST route)${colors.reset}`);
        }
    } catch (e) {
        console.log(`  ${colors.red}✖ Reachability Check Failed: ${e.message}${colors.reset}`);
    }

    console.log(`\n${colors.cyan}--- Diagnostic Complete ---${colors.reset}\n`);
    process.exit(0);
}

runDiagnostics();
