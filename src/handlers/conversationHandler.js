const { sendMessage } = require("../services/metaService");
const { askGemini } = require("../services/geminiService");
const { esNombreValido } = require("../services/nameValidationService");
const systemPrompt = require("../prompts/systemPrompt");

const {
    addMessage,
    getConversation,
    correoYaEnviado,
    marcarCorreoEnviado,
    estaEsperandoNombre,
    setEsperandoNombre
} = require("../memory/memoryManager");

const {
    tieneNombre,
    guardarNombre
} = require("../customer/customerManager");

const {
    obtenerEstadoConversacion,
    obtenerCamposFaltantes
} = require("../sales/salesManager");

const { generarResumen } = require("../sales/summaryManager");
const { sendEmail } = require("../email/emailManager");

function crearPromptDinamico(faltantes) {
    if (!faltantes || faltantes.length === 0) {
        return systemPrompt;
    }

    return `${systemPrompt}

------------------------------------------------------------
ESTADO INTERNO DE LA COTIZACIÓN
------------------------------------------------------------

El sistema todavía considera pendientes estos campos:
${faltantes.map(campo => `• ${campo}`).join("\n")}

REGLAS OBLIGATORIAS PARA ESTA RESPUESTA:

• NO pidas el nombre del cliente todavía.
• NO digas que la cotización ya está completa.
• NO digas que la solicitud ya fue registrada.
• Pregunta únicamente por los datos que todavía faltan.
• Si falta "cantidad", pregunta de forma directa cuántas unidades necesita.
• Si falta "archivo", pregunta si cuenta o no con archivo STL.
• Si falta "imagen", pide una imagen o foto de referencia.
• Si falta "color", pregunta qué color desea.
• Si falta "tamaño", pregunta las medidas.
• Si falta "producto", pregunta qué producto o pieza desea cotizar.
• Mantén la respuesta corta y clara.
`;
}

async function enviarCorreoCotizacion(senderId, conversation) {
    const resumen = generarResumen(conversation, senderId);

    console.log("");
    console.log("===================================");
    console.log("CLIENTE LISTO PARA COTIZAR");
    console.log("===================================");
    console.log(resumen);

    const emailEnviado = await sendEmail(
        "Nuevo cliente - PixelLabs",
        resumen
    );

    if (emailEnviado) {
        marcarCorreoEnviado(senderId);
        console.log("📧 Correo confirmado y marcado como enviado.");
        return true;
    }

    console.error(
        "❌ El correo NO se marcó como enviado. Se podrá reintentar automáticamente."
    );

    return false;
}

const processConversation = async ({ senderId, userMessage, plataforma }) => {
    console.log("");
    console.log("===================================");
    console.log("PROCESS CONVERSATION");
    console.log("===================================");
    console.log("Plataforma:", plataforma);
    console.log("Cliente:", senderId);
    console.log("Mensaje:", userMessage);

    // ======================================
    // SI ESTAMOS ESPERANDO EL NOMBRE
    // ======================================

    if (estaEsperandoNombre(senderId)) {
        const nombreValido = await esNombreValido(userMessage);

        if (!nombreValido) {
            setEsperandoNombre(senderId, true);

            await sendMessage(
                plataforma,
                senderId,
                "Gracias. Solo necesito el nombre de la persona o empresa con la que deseas registrar la cotización.\n\nPor ejemplo:\n• Carlos López\n• Empresa XYZ"
            );

            return;
        }

        guardarNombre(senderId, userMessage);
        addMessage(senderId, "user", userMessage);
        setEsperandoNombre(senderId, false);

        const conversation = getConversation(senderId);

        console.log("");
        console.log("===================================");
        console.log("CLIENTE REGISTRADO");
        console.log("===================================");

        const emailEnviado = await enviarCorreoCotizacion(senderId, conversation);

        if (emailEnviado) {
            await sendMessage(
                plataforma,
                senderId,
                `¡Muchas gracias, ${userMessage}!\n\nHemos registrado correctamente tu solicitud.\n\nUn asesor de PixelLabs revisará tu proyecto y preparará tu cotización lo antes posible.`
            );
        } else {
            await sendMessage(
                plataforma,
                senderId,
                "Gracias. Tu solicitud quedó registrada, pero tuvimos un inconveniente interno al enviar la notificación. La información no se perdió y el sistema volverá a intentarlo."
            );
        }

        return;
    }

    // ======================================
    // GUARDAR MENSAJE DEL CLIENTE
    // ======================================

    addMessage(senderId, "user", userMessage);

    const conversation = getConversation(senderId);

    // ======================================
    // ANALIZAR ESTADO REAL DE LA COTIZACIÓN
    // ======================================

    const estado = obtenerEstadoConversacion(conversation);
    const faltantes = obtenerCamposFaltantes(estado);

    console.log("");
    console.log("===================================");
    console.log("DEBUG COTIZACION");
    console.log("===================================");
    console.log("Estado:", estado);
    console.log("Faltantes:", faltantes);
    console.log("Correo enviado:", correoYaEnviado(senderId));
    console.log("Tiene nombre:", tieneNombre(senderId));
    console.log("===================================");

    // ======================================
    // SI YA ESTÁ COMPLETA, EL BACKEND TOMA EL CONTROL
    // ======================================

    if (
        faltantes.length === 0 &&
        !correoYaEnviado(senderId)
    ) {
        if (!tieneNombre(senderId)) {
            setEsperandoNombre(senderId, true);

            const mensajeNombre =
                "Perfecto, ya tengo toda la información necesaria para preparar tu cotización.\n\n¿A nombre de quién registramos esta solicitud?";

            addMessage(senderId, "assistant", mensajeNombre);
            await sendMessage(plataforma, senderId, mensajeNombre);

            console.log("");
            console.log("===================================");
            console.log("ESPERANDO NOMBRE DEL CLIENTE");
            console.log("===================================");

            return;
        }

        await enviarCorreoCotizacion(senderId, conversation);
        return;
    }

    // ======================================
    // SI FALTAN DATOS, GEMINI SOLO PREGUNTA POR ESOS DATOS
    // ======================================

    const promptDinamico = crearPromptDinamico(faltantes);

    const aiResponse = await askGemini(
        conversation,
        promptDinamico
    );

    addMessage(senderId, "assistant", aiResponse);
    await sendMessage(plataforma, senderId, aiResponse);
};

module.exports = {
    processConversation
};
