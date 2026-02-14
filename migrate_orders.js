const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config({ path: 'c:/Users/SlimShady/Documents/Project/food-delivery/food-delivery-backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
    console.log('--- STARTING ORDER MIGRATION ---');

    // 1. Fetch all orders
    const { data: orders, error: orderError } = await supabase.from('orders').select('*');
    if (orderError) throw orderError;

    for (const order of orders) {
        let needsUpdate = false;
        const updates = {};

        // Ensure public_id exists (UUID)
        if (!order.public_id) {
            updates.public_id = crypto.randomUUID();
            needsUpdate = true;
        }

        // Ensure display_code exists
        if (!order.display_code) {
            // Generate a simple 4-digit code if missing
            updates.display_code = Math.floor(1000 + Math.random() * 9000).toString();
            needsUpdate = true;
        }

        if (needsUpdate) {
            console.log(`Updating Order #${order.id}...`);
            await supabase.from('orders').update(updates).eq('id', order.id);
        }
    }

    // 2. Cross-check order_items
    const { data: items, error: itemError } = await supabase.from('order_items').select('*');
    if (itemError) throw itemError;

    for (const item of items) {
        // In this ecosystem, order_items.order_id typically links to orders.public_id (String/UUID)
        // Let's verify it points to a valid order
        const { data: linkedOrder } = await supabase.from('orders').select('id').eq('public_id', item.order_id).single();
        if (!linkedOrder) {
            console.warn(`Item #${item.id} points to missing order public_id: ${item.order_id}`);
        }
    }

    console.log('--- MIGRATION COMPLETE ---');
}

migrate();
