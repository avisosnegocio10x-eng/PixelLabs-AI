const {
    getSupabaseAdminClient,
    hasSupabaseConfiguration
} = require("../db/supabaseClient");
const memory = require("../../memory/memoryManager");

const CRM_PLATFORMS = Object.freeze(["messenger", "instagram", "whatsapp"]);

function normalizePlatform(platform) {
    const normalized = String(platform || "messenger").trim().toLowerCase();
    if (!CRM_PLATFORMS.includes(normalized)) {
        throw Object.assign(new Error("Plataforma CRM inválida."), {
            statusCode: 400,
            code: "INVALID_CRM_PLATFORM"
        });
    }
    return normalized;
}

function mapContact(row) {
    return {
        id: row.external_id || row.id,
        databaseId: row.id || null,
        nombre: row.display_name || null,
        plataforma: row.platform,
        iaActiva: row.ai_enabled !== false,
        correoEnviado: Boolean(row.email_sent),
        estado: row.status || "ACTIVE",
        ultimaActividad: row.updated_at || null,
        attributionCode: row.first_attribution_code || null,
        metadata: row.metadata || {}
    };
}

function mapConversationMessage(row) {
    return {
        role: row.role === "agent" ? "assistant" : row.role,
        message: row.body || "",
        timestamp: row.occurred_at ? Date.parse(row.occurred_at) : Date.now()
    };
}

class FileCrmRepository {
    async listContacts() {
        return Object.values(memory.getAllConversations());
    }

    async dashboard() {
        const contacts = await this.listContacts();
        return {
            totalClientes: contacts.length,
            iaActiva: contacts.filter(contact => contact.iaActiva).length,
            cotizaciones: contacts.filter(contact => contact.correoEnviado).length
        };
    }

    async recordMessage() {
        return null;
    }

    async getConversationState(platform, externalId) {
        memory.setClientPlatform(externalId, normalizePlatform(platform));
        const contact = memory.getClient(externalId);
        return {
            contact,
            messages: memory.getConversation(externalId),
            waitingForName: Boolean(contact.esperandoNombre)
        };
    }

    async setConversationState(platform, externalId, changes = {}) {
        memory.setClientPlatform(externalId, normalizePlatform(platform));
        if (Object.hasOwn(changes, "displayName")) {
            memory.setClientName(externalId, changes.displayName);
        }
        if (Object.hasOwn(changes, "aiEnabled")) {
            memory.setAiEnabled(externalId, changes.aiEnabled);
        }
        if (Object.hasOwn(changes, "waitingForName")) {
            memory.setEsperandoNombre(externalId, changes.waitingForName);
        }
        if (changes.emailSent) memory.marcarCorreoEnviado(externalId);
        return memory.getClient(externalId);
    }

    async updateContact(platform, externalId, changes) {
        memory.setClientPlatform(externalId, normalizePlatform(platform));
        if (Object.hasOwn(changes, "displayName")) {
            memory.setClientName(externalId, changes.displayName);
        }
        if (Object.hasOwn(changes, "aiEnabled")) {
            memory.setAiEnabled(externalId, changes.aiEnabled);
        }
        if (changes.emailSent) memory.marcarCorreoEnviado(externalId);
        return memory.getClient(externalId);
    }

    async toggleAi(platform, externalId) {
        const contact = memory.getClient(externalId);
        memory.setClientPlatform(externalId, normalizePlatform(platform));
        memory.setAiEnabled(externalId, !contact.iaActiva);
        return memory.getClient(externalId);
    }

    async markOpportunityReady() {
        return null;
    }
}

class SupabaseCrmRepository {
    constructor(client = getSupabaseAdminClient()) {
        this.client = client;
    }

    async upsertContact(platform, externalId, changes = {}) {
        const normalizedPlatform = normalizePlatform(platform);
        const record = {
            platform: normalizedPlatform,
            external_id: String(externalId),
            updated_at: new Date().toISOString()
        };
        if (Object.hasOwn(changes, "displayName")) record.display_name = changes.displayName;
        if (Object.hasOwn(changes, "aiEnabled")) record.ai_enabled = changes.aiEnabled;
        if (Object.hasOwn(changes, "emailSent")) record.email_sent = changes.emailSent;
        if (changes.attributionCode) record.first_attribution_code = changes.attributionCode;
        if (changes.status) record.status = changes.status;
        if (changes.metadata) record.metadata = changes.metadata;

        const { data, error } = await this.client.from("crm_contacts")
            .upsert(record, { onConflict: "platform,external_id" })
            .select("*")
            .single();
        if (error) throw new Error(`No se pudo guardar el contacto CRM: ${error.message}`);
        return data;
    }

    async ensureConversation(contact, platform, externalId) {
        const { data, error } = await this.client.from("crm_conversations")
            .upsert({
                contact_id: contact.id,
                platform: normalizePlatform(platform),
                external_id: String(externalId),
                last_message_at: new Date().toISOString()
            }, { onConflict: "platform,external_id" })
            .select("*")
            .single();
        if (error) throw new Error(`No se pudo guardar la conversación CRM: ${error.message}`);
        return data;
    }

    async recordMessage(input) {
        const contact = await this.upsertContact(input.platform, input.externalContactId, {
            attributionCode: input.attributionCode || undefined
        });
        const conversation = await this.ensureConversation(
            contact,
            input.platform,
            input.externalConversationId || input.externalContactId
        );
        const record = {
            conversation_id: conversation.id,
            direction: input.role === "user" ? "INBOUND" : "OUTBOUND",
            role: input.role,
            external_message_id: input.externalMessageId || null,
            body: String(input.body || ""),
            attachments: input.attachments || [],
            occurred_at: input.occurredAt || new Date().toISOString(),
            metadata: input.metadata || {}
        };
        const { data, error } = await this.client.from("crm_messages")
            .insert(record)
            .select("id")
            .maybeSingle();
        if (error && !(error.code === "23505" && record.external_message_id)) {
            throw new Error(`No se pudo guardar el mensaje CRM: ${error.message}`);
        }
        return {
            contact,
            conversation,
            message: data,
            duplicate: Boolean(error?.code === "23505")
        };
    }

    async getContact(platform, externalId) {
        const normalizedPlatform = normalizePlatform(platform);
        const { data, error } = await this.client.from("crm_contacts")
            .select("*")
            .eq("platform", normalizedPlatform)
            .eq("external_id", String(externalId))
            .maybeSingle();
        if (error) throw new Error(`No se pudo leer el contacto CRM: ${error.message}`);
        return data || this.upsertContact(normalizedPlatform, externalId);
    }

    async getConversationState(platform, externalId) {
        const contact = await this.getContact(platform, externalId);
        const conversation = await this.ensureConversation(
            contact,
            platform,
            externalId
        );
        const { data, error } = await this.client.from("crm_messages")
            .select("role,body,occurred_at")
            .eq("conversation_id", conversation.id)
            .order("occurred_at", { ascending: false })
            .limit(100);
        if (error) throw new Error(`No se pudo recuperar la conversación CRM: ${error.message}`);
        return {
            contact: mapContact(contact),
            messages: (data || []).reverse().map(mapConversationMessage),
            waitingForName: Boolean(contact.metadata?.waitingForName)
        };
    }

    async setConversationState(platform, externalId, changes = {}) {
        const current = await this.getContact(platform, externalId);
        const metadata = { ...(current.metadata || {}) };
        if (Object.hasOwn(changes, "waitingForName")) {
            metadata.waitingForName = Boolean(changes.waitingForName);
        }
        return mapContact(await this.upsertContact(platform, externalId, {
            ...(Object.hasOwn(changes, "displayName")
                ? { displayName: changes.displayName }
                : {}),
            ...(Object.hasOwn(changes, "aiEnabled")
                ? { aiEnabled: changes.aiEnabled }
                : {}),
            ...(Object.hasOwn(changes, "emailSent")
                ? { emailSent: changes.emailSent }
                : {}),
            metadata
        }));
    }

    async listContacts() {
        const { data, error } = await this.client.from("crm_contacts")
            .select("*").order("updated_at", { ascending: false }).limit(250);
        if (error) throw new Error(`No se pudo consultar el CRM: ${error.message}`);
        return (data || []).map(mapContact);
    }

    async dashboard() {
        const contacts = await this.listContacts();
        return {
            totalClientes: contacts.length,
            iaActiva: contacts.filter(contact => contact.iaActiva).length,
            cotizaciones: contacts.filter(contact => contact.correoEnviado).length
        };
    }

    async updateContact(platform, externalId, changes) {
        return mapContact(await this.upsertContact(platform, externalId, changes));
    }

    async toggleAi(platform, externalId) {
        const normalizedPlatform = normalizePlatform(platform);
        const { data: existing, error } = await this.client.from("crm_contacts")
            .select("ai_enabled").eq("platform", normalizedPlatform)
            .eq("external_id", String(externalId)).maybeSingle();
        if (error) throw new Error(`No se pudo leer el contacto CRM: ${error.message}`);
        if (!existing) {
            throw Object.assign(new Error("Cliente no encontrado."), {
                statusCode: 404,
                code: "CRM_CONTACT_NOT_FOUND"
            });
        }
        return this.updateContact(platform, externalId, { aiEnabled: !existing.ai_enabled });
    }

    async markOpportunityReady(input) {
        const contact = await this.upsertContact(input.platform, input.externalContactId, {
            emailSent: true,
            status: "QUALIFIED"
        });
        const conversation = await this.ensureConversation(
            contact,
            input.platform,
            input.externalConversationId || input.externalContactId
        );
        const { data, error } = await this.client.from("crm_opportunities").insert({
            contact_id: contact.id,
            conversation_id: conversation.id,
            status: "READY_FOR_QUOTE",
            extracted_quote: input.quote || {},
            metadata: { source: "chatbot", manualApprovalRequired: true }
        }).select("id").single();
        if (error) throw new Error(`No se pudo crear la oportunidad CRM: ${error.message}`);
        return data;
    }
}

function createCrmRepository() {
    return hasSupabaseConfiguration()
        ? new SupabaseCrmRepository()
        : new FileCrmRepository();
}

module.exports = {
    CRM_PLATFORMS,
    FileCrmRepository,
    SupabaseCrmRepository,
    createCrmRepository,
    normalizePlatform,
    mapContact,
    mapConversationMessage
};
