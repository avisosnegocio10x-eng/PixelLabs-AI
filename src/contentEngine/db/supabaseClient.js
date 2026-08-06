const { createClient } = require("@supabase/supabase-js");

let client;

function hasSupabaseConfiguration() {
    return Boolean(
        process.env.SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );
}

function getSupabaseAdminClient() {
    if (!hasSupabaseConfiguration()) {
        return null;
    }

    if (!client) {
        client = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                },
                global: {
                    headers: {
                        "X-Client-Info": "pixellabs-content-engine/0.1"
                    }
                }
            }
        );
    }

    return client;
}

module.exports = {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
};
