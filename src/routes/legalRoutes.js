const express = require("express");

const router = express.Router();

// =====================================
// POLÍTICA DE PRIVACIDAD
// =====================================

router.get("/privacy", (req, res) => {

    res.send(`

    <html>

    <head>

        <title>PixelLabs - Política de Privacidad</title>

    </head>

    <body style="font-family:Arial;padding:40px;max-width:900px;margin:auto;">

        <h1>Política de Privacidad</h1>

        <p>

        PixelLabs utiliza la información enviada por los usuarios
        únicamente para responder consultas y generar cotizaciones.

        </p>

        <p>

        No vendemos ni compartimos información personal con terceros.

        </p>

        <p>

        La información enviada mediante Messenger o Instagram
        puede almacenarse únicamente para dar seguimiento a la solicitud.

        </p>

        <p>

        Contacto:

        avisos.negocio10x@gmail.com

        </p>

    </body>

    </html>

    `);

});

// =====================================
// ELIMINACIÓN DE DATOS
// =====================================

router.get("/delete-data", (req, res) => {

    res.send(`

    <html>

    <head>

        <title>Eliminar datos</title>

    </head>

    <body style="font-family:Arial;padding:40px;max-width:900px;margin:auto;">

        <h1>Solicitud de eliminación de datos</h1>

        <p>

        Si deseas eliminar la información almacenada por PixelLabs,
        envía un correo a:

        </p>

        <h3>

        avisos.negocio10x@gmail.com

        </h3>

        <p>

        También puedes escribirnos por Messenger o Instagram.

        </p>

    </body>

    </html>

    `);

});

module.exports = router;