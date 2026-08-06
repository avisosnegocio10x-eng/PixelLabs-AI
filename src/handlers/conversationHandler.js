const { sendMessage } = require("../services/metaService");
const { askGemini } = require("../services/geminiService");
const { esNombreValido } = require("../services/nameValidationService");
const systemPrompt = require("../prompts/systemPrompt");
const {
    addMessage,
    getConversation,
    getClient,
    correoYaEnviado,
    marcarCorreoEnviado,
    estaEsperandoNombre,
    setEsperandoNombre,
    setClientPlatform
} = require("../memory/memoryManager");
const { tieneNombre, guardarNombre } = require("../customer/customerManager");
const { obtenerEstadoConversacion, obtenerCamposFaltantes } = require("../sales/salesManager");
const { generarResumen } = require("../sales/summaryManager");
const { extraerCotizacion } = require("../sales/quoteExtractor");
const { sendEmail } = require("../email/emailManager");
const { createCrmRepository } = require("../contentEngine/repositories/crmRepository");

const crm = createCrmRepository();

function extractAttributionCode(message) {
    return String(message || "").toUpperCase().match(/\bPL-[A-Z0-9-]{4,40}\b/)?.[0] || null;
}

async function safeCrm(operation) {
    try {
        return await operation();
    } catch (error) {
        console.error("CRM sync failed", { message: error.message });
        return null;
    }
}

async function recordCrmMessage({
    plataforma,
    senderId,
    role,
    body,
    externalMessageId = null
}) {
    return safeCrm(() => crm.recordMessage({
        platform: plataforma,
        externalContactId: senderId,
        externalConversationId: senderId,
        externalMessageId,
        role,
        body,
        attributionCode: role === "user" ? extractAttributionCode(body) : null
    }));
}

async function sendAndRecord(plataforma, senderId, message) {
    await sendMessage(plataforma, senderId, message);
    addMessage(senderId, "assistant", message);
    await recordCrmMessage({ plataforma, senderId, role: "assistant", body: message });
}

async function registerReadyOpportunity({ plataforma, senderId, conversation }) {
    const resumen = generarResumen(conversation, senderId);
    await sendEmail("Nuevo cliente - PixelLabs", resumen);
    marcarCorreoEnviado(senderId);
    await safeCrm(() => crm.markOpportunityReady({
        platform: plataforma,
        externalContactId: senderId,
        externalConversationId: senderId,
        quote: extraerCotizacion(conversation)
    }));
}

const processConversation = async ({
    senderId,
    userMessage,
    plataforma,
    externalMessageId = null
}) => {
    setClientPlatform(senderId, plataforma);

    if (estaEsperandoNombre(senderId)) {
        const nombreValido = await esNombreValido(userMessage);
        if (!nombreValido) {
            setEsperandoNombre(senderId, true);
            await sendAndRecord(
                plataforma,
                senderId,
                "Gracias. Solo necesito el nombre de la persona o empresa con la que deseas registrar la cotización.\n\nPor ejemplo:\n• Carlos López\n• Empresa XYZ"
            );
            return;
        }

        guardarNombre(senderId, userMessage);
        addMessage(senderId, "user", userMessage);
        await recordCrmMessage({
            plataforma,
            senderId,
            role: "user",
            body: userMessage,
            externalMessageId
        });
        await safeCrm(() => crm.updateContact(plataforma, senderId, {
            displayName: userMessage.trim()
        }));
        setEsperandoNombre(senderId, false);

        const conversation = getConversation(senderId);
        await registerReadyOpportunity({ plataforma, senderId, conversation });
        await sendAndRecord(
            plataforma,
            senderId,
            `¡Muchas gracias, ${userMessage.trim()}!\n\nHemos registrado correctamente tu solicitud.\n\nUn asesor de PixelLabs revisará tu proyecto y preparará tu cotización lo antes posible.`
        );
        return;
    }

    addMessage(senderId, "user", userMessage);
    await recordCrmMessage({
        plataforma,
        senderId,
        role: "user",
        body: userMessage,
        externalMessageId
    });

    if (!getClient(senderId).iaActiva) return;

    const conversation = getConversation(senderId);
    const estado = obtenerEstadoConversacion(conversation);
    const faltantes = obtenerCamposFaltantes(estado);
    const aiResponse = await askGemini(conversation, systemPrompt);
    await sendAndRecord(plataforma, senderId, aiResponse);

    if (faltantes.length !== 0 || correoYaEnviado(senderId)) return;

    if (!tieneNombre(senderId)) {
        setEsperandoNombre(senderId, true);
        return;
    }

    await registerReadyOpportunity({ plataforma, senderId, conversation });
};

module.exports = {
    processConversation,
    extractAttributionCode
};
