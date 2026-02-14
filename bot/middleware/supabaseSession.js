const supabase = require('../config/supabase');

/**
 * Custom Supabase Session Middleware for Telegraf
 * Persists session data to 'bot_sessions' table.
 */
function supabaseSession() {
    return async (ctx, next) => {
        const key = `${ctx.from.id}:${ctx.chat.id}`;
        let initialSessionJson = '{}';

        // 1. Load Session
        let session = {};
        try {
            const { data, error } = await supabase
                .from('bot_sessions')
                .select('session')
                .eq('key', key)
                .single();

            if (data && data.session) {
                session = data.session;
                initialSessionJson = JSON.stringify(session);
            }
        } catch (e) {
            // If error is "Row not found", it's fine, we start empty.
        }

        // Attach to context
        Object.defineProperty(ctx, 'session', {
            get: function () { return session; },
            set: function (newValue) {
                session = newValue; // Allow direct assignment
            }
        });

        // Add manual flush method
        ctx.saveSession = async () => {
            const currentSessionJson = JSON.stringify(session || {});
            if (currentSessionJson === initialSessionJson) {
                return; // No changes, skip write
            }

            try {
                console.log(`[Session] Saving session for ${key}...`);
                const { error } = await supabase
                    .from('bot_sessions')
                    .upsert({
                        key: key,
                        session: session,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });

                if (!error) {
                    initialSessionJson = currentSessionJson;
                    console.log(`[Session] Session saved for ${key}`);
                } else {
                    console.error(`[Session] Error saving session for ${key}:`, error?.message);
                }
            } catch (err) {
                console.error('Session Upsert Error:', err);
            }
        };

        // 2. Run handlers
        await next();

        // 3. Save Session (Upsert) - Only if dirty
        await ctx.saveSession();
    };
}

module.exports = supabaseSession;
