const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    cyan: "\x1b[36m"
};

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function clearScreen() {
    console.clear();
    console.log(`${colors.cyan}===========================================${colors.reset}`);
    console.log(`${colors.cyan}   🛠 SYSTEM MAINTENANCE TOOL v2.0   ${colors.reset}`);
    console.log(`${colors.cyan}===========================================${colors.reset}\n`);
}

async function refreshDatabase() {
    console.log(`\n${colors.yellow}--- REFRESH DATABASE ---${colors.reset}`);
    console.log(`This will ${colors.red}TRUNCATE${colors.reset} orders, reviews, chat_messages, and crash_logs.`);
    console.log(`Profiles and Menu Items will be ${colors.green}PRESERVED${colors.reset}.`);

    // Safety prompt
    const confirm = await new Promise(resolve => {
        rl.question(`\nAre you sure? type 'yes' to proceed: `, ans => resolve(ans));
    });

    if (confirm !== 'yes') {
        console.log('Operation cancelled.');
        return;
    }

    console.log(`${colors.cyan}Truncating tables...${colors.reset}`);
    const query = `
        TRUNCATE public.order_items, public.chat_messages, public.orders CASCADE;
        TRUNCATE public.reviews, public.crash_logs, public.favorites, public.bot_sessions;
        ALTER SEQUENCE IF EXISTS public.orders_id_seq RESTART WITH 1;
        ALTER SEQUENCE IF EXISTS public.order_items_id_seq RESTART WITH 1;
        ALTER SEQUENCE IF EXISTS public.payment_methods_id_seq RESTART WITH 1;
    `;

    const { error } = await supabase.rpc('execute_sql', { query });
    if (error) {
        // Fallback
        console.log(`${colors.yellow}RPC failed (${error.message}). Attempting manual delete...${colors.reset}`);
        await supabase.from('order_items').delete().neq('id', 0);
        await supabase.from('orders').delete().neq('id', 0);
        await supabase.from('chat_messages').delete().neq('id', 0);
        await supabase.from('crash_logs').delete().neq('id', 0);
        console.log(`${colors.green}Manual delete completed.${colors.reset}`);
    } else {
        console.log(`${colors.green}✔ Database refreshed successfully.${colors.reset}`);
    }
}

async function selectiveCleanup() {
    console.log(`\n${colors.yellow}--- SELECTIVE CLEANUP ---${colors.reset}`);
    console.log(`Enter '0' to clear ${colors.red}EVERYTHING${colors.reset} (up to this second).`);
    const days = await new Promise(resolve => {
        rl.question(`Clear data older than how many days? (0-999, default 30): `, ans => resolve(ans.trim() || '30'));
    });

    const parsedDays = parseInt(days);
    if (isNaN(parsedDays) || parsedDays < 0) {
        console.log(`${colors.red}Invalid number of days.${colors.reset}`);
        return;
    }

    if (parsedDays === 0) {
        const confirm = await new Promise(resolve => {
            rl.question(`\n${colors.red}WARNING: This will wipe ALL data for these categories.${colors.reset}\nType 'wipe' to confirm: `, ans => resolve(ans));
        });
        if (confirm !== 'wipe') {
            console.log('Operation cancelled.');
            return;
        }
    }

    console.log(`Deleting data older than ${parsedDays} days...`);
    const dateStr = new Date(Date.now() - parsedDays * 24 * 60 * 60 * 1000).toISOString();

    // Delete children first to avoid FK violations (unless CASCADE is set, but explicit is safer)
    // 1. Order Items (referencing Orders)
    // 2. Chat Messages (referencing Orders)
    // 3. Orders
    // 4. Other independent tables
    const query = `
        DELETE FROM public.order_items 
        WHERE order_id IN (SELECT public_id FROM public.orders WHERE created_at < '${dateStr}');

        DELETE FROM public.chat_messages WHERE created_at < '${dateStr}';
        DELETE FROM public.reviews WHERE created_at < '${dateStr}';
        DELETE FROM public.favorites WHERE created_at < '${dateStr}';
        DELETE FROM public.bot_sessions WHERE updated_at < '${dateStr}';
        DELETE FROM public.crash_logs WHERE created_at < '${dateStr}';
        
        DELETE FROM public.orders WHERE created_at < '${dateStr}';
    `;

    const { error } = await supabase.rpc('execute_sql', { query });
    if (error) {
        console.log(`${colors.red}Cleanup failed: ${error.message}${colors.reset}`);
    } else {
        console.log(`${colors.green}✔ Selective cleanup completed.${colors.reset}`);
    }
}

async function cleanupStorage(bucketName, daysLimit = 30) {
    console.log(`\n${colors.yellow}--- CLEANUP STORAGE: ${bucketName} ---${colors.reset}`);

    if (daysLimit === 0) {
        console.log(`${colors.red}Targeting ALL files in '${bucketName}'...${colors.reset}`);
    } else {
        console.log(`Deleting files older than ${daysLimit} days...`);
    }

    const { data: files, error } = await supabase.storage.from(bucketName).list('', { limit: 1000 });
    if (error) {
        console.log(`${colors.red}Error listing files in ${bucketName}: ${error.message}${colors.reset}`);
        return;
    }

    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - daysLimit);

    const toDelete = files
        .filter(f => new Date(f.created_at) < limitDate && f.name !== '.emptyFolderPlaceholder')
        .map(f => f.name);

    if (toDelete.length === 0) {
        console.log(`${colors.green}✔ No expired files found in ${bucketName}.${colors.reset}`);
        return;
    }

    console.log(`Deleting ${toDelete.length} files from ${bucketName}...`);
    const { error: delError } = await supabase.storage.from(bucketName).remove(toDelete);
    if (delError) {
        console.log(`${colors.red}Error deleting from ${bucketName}: ${delError.message}${colors.reset}`);
    } else {
        console.log(`${colors.green}✔ ${bucketName} cleanup complete.${colors.reset}`);
    }
}

async function resetDriverStatus() {
    console.log(`\n${colors.yellow}--- RESET DRIVER STATUS ---${colors.reset}`);
    console.log(`Clearing all driver locations and resetting status...`);

    const { error } = await supabase
        .from('profiles')
        .update({ last_location_json: null })
        .eq('role', 'driver');

    if (error) {
        console.log(`${colors.red}Failed to reset drivers: ${error.message}${colors.reset}`);
    } else {
        console.log(`${colors.green}✔ Driver locations cleared.${colors.reset}`);
    }
}

async function deepCleanStorage() {
    const buckets = ['payments', 'logs', 'pod_proofs'];
    const days = await new Promise(resolve => {
        rl.question(`Clear files older than how many days? (default 30): `, ans => resolve(ans.trim() || '30'));
    });

    for (const bucket of buckets) {
        await cleanupStorage(bucket, parseInt(days));
    }
}

async function initSettings() {
    console.log(`\n${colors.yellow}--- INIT SETTINGS ---${colors.reset}`);

    // 1. App Settings Table
    console.log(`Updating 'app_settings'...`);
    const { error: setErr } = await supabase.from('app_settings').upsert({ key: 'delivery_fee', value: '100' });
    if (setErr) console.log(`${colors.red}Failed to set delivery_fee: ${setErr.message}${colors.reset}`);
    else console.log(`${colors.green}✔ delivery_fee set to 100${colors.reset}`);

    // 2. Menu Item Config Hack (Legacy Support)
    console.log(`Updating legacy menu_item config...`);
    const { data } = await supabase.from('menu_items').select('*').eq('title', '__PAYMENT_CONFIG__').single();
    if (!data) {
        await supabase.from('menu_items').insert([{
            title: '__PAYMENT_CONFIG__',
            price: 0,
            description: 'Bank: CBE\nAccount: 1000123456789\nName: Food Delivery Ltd',
            category: 'SYSTEM',
            is_available: false
        }]);
        console.log(`${colors.green}✔ Config menu item created.${colors.reset}`);
    } else {
        console.log(`${colors.green}✔ Config menu item already exists.${colors.reset}`);
    }
}

async function main() {
    while (true) {
        clearScreen();
        console.log(`1. 🔄 Full Refresh (Truncate Orders/Logs)`);
        console.log(`2. 🗑️ Selective Cleanup (Delete Old Data)`);
        console.log(`3. 📍 Reset Driver Status (Clear Locations)`);
        console.log(`4. 🧹 Deep Clean Storage (Payments/Logs/Pods)`);
        console.log(`5. ⚙️ Initialize System Settings`);
        console.log(`6. 🚪 Exit`);

        const choice = await new Promise(resolve => {
            rl.question(`\nSelect option (1-6): `, ans => resolve(ans.trim()));
        });

        switch (choice) {
            case '1': await refreshDatabase(); break;
            case '2': await selectiveCleanup(); break;
            case '3': await resetDriverStatus(); break;
            case '4': await deepCleanStorage(); break;
            case '5': await initSettings(); break;
            case '6':
                rl.close();
                process.exit(0);
                break;
            default:
                console.log(`${colors.red}Invalid option.${colors.reset}`);
        }

        if (choice !== '4') {
            await new Promise(resolve => {
                rl.question(`\nPress ENTER to continue...`, () => resolve());
            });
        }
    }
}

main();
