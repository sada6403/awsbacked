const nodemailer = require('nodemailer');

// Email credentials from env or fallback (for DEV only)
const EMAIL_USER = process.env.EMAIL_USER || 'nfplantation.official.it@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS || 'ztfz bekz vozc nuf'; // Replace with real app password if needed

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

const sendEmail = async (to, subject, html) => {
    try {
        const mailOptions = {
            from: '"Nature Farming" <nfplantation.official.it@gmail.com>',
            to,
            subject,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

module.exports = sendEmail;
