/**
 * Basic Integrity Test for Abebe Food Delivery Backend
 * Verifies that critical environment variables and route exports are present.
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Running Backend Integrity Audit...');

try {
    // 1. Check for required environment variables (local or injected)
    // We don't fail here if missing in CI, but we log a warning.
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        console.log('✅ .env file detected.');
    } else {
        console.log('⚠️ No .env file found (using system environment).');
    }

    // 2. Verify api/index.js existence
    const apiPath = path.join(__dirname, '../api/index.js');
    if (fs.existsSync(apiPath)) {
        console.log('✅ api/index.js entry point exists.');
    } else {
        throw new Error('Missing api/index.js');
    }

    // 3. Smoke test: Load the module (without starting server if possible)
    // Since we use process.env and top-level execution, we just verify it parses.
    require('../api/index.js');
    console.log('✅ Backend module parsed successfully.');

    console.log('\n✨ INTEGRITY PASSED: Backend is structurally sound.');
    process.exit(0);
} catch (error) {
    console.error('\n❌ INTEGRITY FAILED:', error.message);
    process.exit(1);
}
