const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkIntegrity() {
    console.log('--- SYSTEM INTEGRITY CHECK ---');

    // 1. Check Orders
    const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select('*, order_items(*, menu_items(title))')
        .order('created_at', { ascending: false })
        .limit(5);

    if (orderError) {
        console.error('❌ Orders Fetch Error:', orderError.message);
    } else {
        console.log(`✅ Found ${orders.length} orders.`);
        orders.forEach(o => {
            console.log(`- Order ID: ${o.id}, Display: ${o.display_code}, Status: ${o.status}, User: ${o.user_id}`);
            if (!o.display_code) console.warn('  ⚠️ WARNING: Missing display_code!');
        });
    }

    // 2. Check Profiles (Relationships)
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .limit(5);

    if (profileError) {
        console.error('❌ Profiles Fetch Error:', profileError.message);
    } else {
        console.log(`✅ Profiles accessible.`);
    }

    // 4. Test driver join (The one suspected of filtering out orders)
    console.log('\n--- Testing Driver Join Query ---');
    const { data: driverQuery, error: driverError } = await supabase
        .from('orders')
        .select('*, driver_profile:profiles!driver_id(*)')
        .limit(3);

    if (driverError) {
        console.warn('❌ Driver Join Query FAILED/Empty:', driverError.message);
    } else {
        console.log(`✅ Driver Join Query SUCCESS. Found ${driverQuery.length} rows.`);
        driverQuery.forEach(o => {
            console.log(`- Order ${o.id}: Driver is ${o.driver_id ? 'Assigned' : 'NULL'}`);
        });
        if (driverQuery.length === 0 && orders.length > 0) {
            console.error('   🚨 CRITICAL: Query returned 0 results even though orders exist! The join is too strict.');
        }
    }

    process.exit();
}

checkIntegrity();
