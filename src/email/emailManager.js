const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({

    service: "gmail",

    auth: {

        user: process.env.EMAIL_USER,

        pass: process.env.EMAIL_PASS

    }

});

const sendEmail = async (subject, text) => {

    try {

        await transporter.sendMail({

            from: process.env.EMAIL_USER,

            to: process.env.EMAIL_USER,

            subject,

            text

        });

        console.log("📧 Correo enviado correctamente.");

    } catch (error) {

        console.error("❌ Error enviando correo:");

        console.error(error);

    }

};

module.exports = {

    sendEmail

};