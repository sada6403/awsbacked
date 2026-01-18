// services/emailService.js
const nodemailer = require('nodemailer');
const path = require('path');

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
                // mailOptions.text += `\n\nView Bill: ${attachmentUrl}`; // Removed to avoid showing raw path

                // Construct absolute path for attachment
                try {
                    // Remove leading slash or backslash if present to ensure path.join works as relative
                    const safeUrl = attachmentUrl.replace(/^[\/\\]/, '');
                    const filePath = path.join(__dirname, '..', 'public', safeUrl);

                    console.log('Attaching file from:', filePath);

                    mailOptions.attachments = [{
                        filename: path.basename(attachmentUrl),
                        path: filePath
                    }];
                } catch (err) {
                    console.error('Error preparing attachment (sending email without attachment):', err);
                }
            }

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully:', info.messageId);
            return { success: true, id: info.messageId };
        } catch (error) {
            console.error('Email send error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendBillEmail(to, billData, pdfUrl) {
        const { name, type, billNumber, date, amount } = billData;
        const subject = `Your Nature Farming Bill - ${billNumber}`;
        const body = `Dear ${name},\n\nYour transaction (${type}) was completed successfully.\n\nDate: ${date}\nBill Number: ${billNumber}\nAmount: Rs. ${amount}\n\nPlease find your bill attached.\n\nThank you,\nNature Farming`;

        return this.sendEmail(to, subject, body, pdfUrl);
    }
}

module.exports = new EmailService();
