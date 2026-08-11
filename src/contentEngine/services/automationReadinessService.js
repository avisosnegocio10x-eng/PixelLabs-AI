const { getSupabaseAdminClient } = require("../db/supabaseClient");
const { checkSupabaseReadiness } = require("./readinessService");

const RESOURCE_TABLES = Object.freeze({
    catalog: "products",
    crm: "crm_contacts",
    trends: "trends",
    calendar: "content_ideas",
    contentLibrary: "content_items",
    reviews: "content_reviews",
    clips: "video_clips",
    workflowJobs: "workflow_jobs",
    executionLogs: "audit_logs"
});

class AutomationReadinessService {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async check() {
        if (!this.client) {
            throw Object.assign(new Error("Supabase no está configurado."), {
                statusCode: 503,
                code: "SUPABASE_NOT_CONFIGURED"
            });
        }
        const readiness = await checkSupabaseReadiness({ client: this.client });
        const resources = {};
        for (const [name, table] of Object.entries(RESOURCE_TABLES)) {
            const { count, error } = await this.client.from(table)
                .select("*", { count: "exact", head: true });
            resources[name] = {
                reachable: !error,
                records: error ? null : Number(count || 0)
            };
            if (error) {
                throw Object.assign(new Error(`No se pudo comprobar ${table}.`), {
                    statusCode: 503,
                    code: "AUTOMATION_RESOURCE_UNAVAILABLE"
                });
            }
        }
        return {
            ...readiness,
            resources,
            serviceRoleExposedToN8n: false,
            autoPublish: false,
            humanApprovalRequired: true
        };
    }
}

module.exports = {
    AutomationReadinessService,
    RESOURCE_TABLES
};
