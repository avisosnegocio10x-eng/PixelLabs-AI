const { sendMessage } = require("../services/metaService");
const { askGemini } = require("../services/geminiService");

const {
    esNombreValido
} = require("../services/nameValidationService");

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

const {
    generarResumen
} = require("../sales/summaryManager");

const {
    sendEmail
} = require("../email/emailManager");

const processConversation = async ({
    senderId,
    userMessage,
    plataforma
}) => {

    console.log("");

    console.log("===================================");

    console.log("PROCESS CONVERSATION");

    console.log("===================================");

    console.log("Plataforma:", plataforma);

    console.log("Cliente:", senderId);

    console.log("Mensaje:", userMessage);

    // ======================================
    // VALIDAR SI ESTAMOS ESPERANDO EL NOMBRE
    // ======================================

    if (estaEsperandoNombre(senderId)) {

        const nombreValido =
            await esNombreValido(userMessage);

        if (!nombreValido) {

            setEsperandoNombre(
                senderId,
                true
            );

               await sendMessage(
    plataforma,
    senderId,
    "Gracias. Solo necesito el nombre de la persona o empresa con la que deseas registrar la cotización.\n\nPor ejemplo:\n• Carlos López\n• Empresa XYZ"
);
    

            return;

        }

        guardarNombre(
            senderId,
            userMessage
        );

        addMessage(
            senderId,
            "user",
            userMessage
        );

        setEsperandoNombre(
            senderId,
            false
        );

        const conversation =
            getConversation(senderId);

        const resumen =
            generarResumen(
                conversation,
                senderId
            );

        console.log("");

        console.log("===================================");

        console.log("CLIENTE REGISTRADO");

        console.log("===================================");

        console.log(resumen);

        await sendEmail(
            "Nuevo cliente - PixelLabs",
            resumen
        );

        marcarCorreoEnviado(
            senderId
        );

        console.log(
            "📧 Correo enviado solo una vez."
        );

     await sendMessage(
    plataforma,
    senderId,
    `¡Muchas gracias, ${userMessage}!

Hemos registrado correctamente tu solicitud.

Un asesor de PixelLabs revisará tu proyecto y preparará tu cotización lo antes posible.`
);

        return;

    }
        // ======================================
    // GUARDAR MENSAJE DEL CLIENTE
    // ======================================

    addMessage(
        senderId,
        "user",
        userMessage
    );

    const conversation =
        getConversation(senderId);

    // ======================================
    // ANALIZAR ESTADO DE LA COTIZACIÓN
    // ======================================

    const estado =
        obtenerEstadoConversacion(
            conversation
        );

    const faltantes =
        obtenerCamposFaltantes(
            estado
        );

    // ======================================
    // CONSULTAR GEMINI
    // ======================================

    const aiResponse =
        await askGemini(
            conversation,
            systemPrompt
        );

    addMessage(
        senderId,
        "assistant",
        aiResponse
    );

   await sendMessage(
    plataforma,
    senderId,
    aiResponse
);
    // ======================================
    // VERIFICAR SI LA COTIZACIÓN ESTÁ COMPLETA
    // ======================================

    console.log("");

console.log("===================================");

console.log("DEBUG COTIZACION");

console.log("===================================");

console.log("Faltantes:", faltantes);

console.log("Correo enviado:", correoYaEnviado(senderId));

console.log("Tiene nombre:", tieneNombre(senderId));

console.log("===================================");

    if (
        faltantes.length === 0 &&
        !correoYaEnviado(senderId)
    ) {

        if (!tieneNombre(senderId)) {

            setEsperandoNombre(
                senderId,
                true
            );

            console.log("");

            console.log("===================================");

            console.log("ESPERANDO NOMBRE DEL CLIENTE");

            console.log("===================================");

            return;

        }

        const resumen =
            generarResumen(
                conversation,
                senderId
            );

        console.log("");

        console.log("===================================");

        console.log("CLIENTE LISTO PARA COTIZAR");

        console.log("===================================");

        console.log(resumen);

        await sendEmail(
            "Nuevo cliente - PixelLabs",
            resumen
        );

        marcarCorreoEnviado(
            senderId
        );

        console.log(
            "📧 Correo enviado correctamente."
        );

    }
    };

module.exports = {

    processConversation

};