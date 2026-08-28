const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (subject, text) => {
    console.log("===== ENTRÓ A emailManager =====");

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject,
            text
        });

        console.log("📧 Correo enviado correctamente.");
        console.log("===== EMAIL TERMINÓ =====");

        return true;
    } catch (error) {
        console.error("❌ Error enviando correo:");
        console.error(error?.response || error?.message || error);

        return false;
    }
};

module.exports = {
    sendEmail
};
