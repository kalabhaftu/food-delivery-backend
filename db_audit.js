const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/SlimShady/Documents/Project/food-delivery/food-delivery-backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkOrders() {
    console.log("--- ORDER DUMP ---");
    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, display_code, status, user_id, driver_id, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    orders.forEach(o => {
        console.log(`Order ID: ${o.id} | Display: ${o.display_code} | Status: ${o.status} | Driver: ${o.driver_id || 'NULL'} | User: ${o.user_id}`);
    });

    console.log("\n--- DRIVER PROFILES ---");
    const { data: drivers, error: driverError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'DRIVER');

    if (driverError) {
        console.error("Error fetching drivers:", driverError);
    } else {
        drivers.forEach(d => {
            console.log(`Driver: ${d.full_name} | ID: ${d.id}`);
        });
    }
}

checkOrders();
