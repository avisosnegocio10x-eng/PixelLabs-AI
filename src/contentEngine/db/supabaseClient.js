const { createClient } = require("@supabase/supabase-js");

let client;

function hasSupabaseConfiguration(environment = process.env) {
    return Boolean(
        environment.SUPABASE_URL &&
        environment.SUPABASE_SERVICE_ROLE_KEY
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
