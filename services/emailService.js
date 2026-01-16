// services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // Configure transporter if env vars exist, else use mock
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail', // or configurable host
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });
        } else {
            this.transporter = null;
        }
    }

    async sendEmail(to, subject, text, attachmentUrl = null) {
        if (!to) return { success: false, error: 'No recipient' };

        console.log('\n--- EMAIL OUTGOING ---');
        console.log(`TO: ${to}`);
        console.log(`SUBJECT: ${subject}`);
        console.log(`BODY: ${text}`);
        if (attachmentUrl) console.log(`ATTACHMENT: ${attachmentUrl}`);
        console.log('----------------------\n');

        if (!this.transporter) {
            return { success: true, mocked: true };
        }

        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: to,
                subject: subject,
                text: text,
            };

            if (attachmentUrl) {
                mailOptions.text += `\n\nView Bill: ${attachmentUrl}`;
                // Actual PDF attachment logic would require fetching the file stream or path
                // For now, we send the link in the body or standard attachment object
            }

            const info = await this.transporter.sendMail(mailOptions);
            return { success: true, id: info.messageId };
        } catch (error) {
            console.error('Email send error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendBillEmail(to, billData, pdfUrl) {
        const { name, type, billNumber, date, amount } = billData;
        const subject = `Your Nature Farming Bill - ${billNumber}`;
        const body = `Dear ${name},\n\nYour transaction (${type}) was completed successfully.\n\nDate: ${date}\nBill Number: ${billNumber}\nAmount: Rs. ${amount}\n\nPlease find your bill linked below or attached.\n\n${pdfUrl || ''}\n\nThank you,\nNature Farming`;

        return this.sendEmail(to, subject, body, pdfUrl);
    }
}

module.exports = new EmailService();
