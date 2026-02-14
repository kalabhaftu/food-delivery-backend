const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/SlimShady/Documents/Project/food-delivery/food-delivery-backend/.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runAudit() {
    console.log('--- STARTING ECOSYSTEM AUDIT ---');

    // 1. Check Roles
    const { data: profiles } = await supabase.from('profiles').select('role');
    const roles = [...new Set(profiles.map(p => p.role))];
    console.log('Unique Roles in DB:', roles);

    // 2. Check Orders
    const { data: orders } = await supabase.from('orders').select('id, display_code, public_id, status');
    console.log('Total Orders:', orders.length);
    const missingDisplay = orders.filter(o => !o.display_code);
    const missingPublic = orders.filter(o => !o.public_id);
    console.log('Orders missing display_code:', missingDisplay.length);
    console.log('Orders missing public_id:', missingPublic.length);

    // 3. Stats by Role
    const driverCount = profiles.filter(p => p.role?.toLowerCase() === 'driver').length;
    const adminCount = profiles.filter(p => p.role?.toLowerCase() === 'admin').length;
    const clientCount = profiles.filter(p => p.role?.toLowerCase() === 'client' || !p.role).length;
    console.log(`Summary: Drivers(${driverCount}), Admins(${adminCount}), Clients(${clientCount})`);

    console.log('--- AUDIT COMPLETE ---');
}

runAudit();
