const express = require("express");

const router = express.Router();

router.get("/", (req, res) => {

    res.send(`

        <html>

            <head>

                <title>PixelLabs AI</title>

                <style>

                    body{

                        font-family: Arial;

                        background:#111827;

                        color:white;

                        display:flex;

                        justify-content:center;

                        align-items:center;

                        height:100vh;

                        margin:0;

                    }

                    .card{

                        background:#1F2937;

                        padding:40px;

                        border-radius:15px;

                        text-align:center;

                        width:500px;

                        box-shadow:0px 0px 25px rgba(0,0,0,.4);

                    }

                    h1{

                        margin-bottom:15px;

                    }

                    p{

                        color:#D1D5DB;

                    }

                </style>

            </head>

            <body>

                <div class="card">

                    <h1>🤖 PixelLabs AI</h1>

                    <h2>Panel Administrativo</h2>

                    <p>Sistema funcionando correctamente.</p>

                </div>

            </body>

        </html>

    `);

});

module.exports = router;