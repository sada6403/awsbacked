const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateBillPDF = (transaction, member, fieldVisitor) => {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const billsDir = path.join(__dirname, '..', 'public', 'bills');
            if (!fs.existsSync(billsDir)) {
                fs.mkdirSync(billsDir, { recursive: true });
            }

            const fileName = `${transaction.billNumber}.pdf`;
            const filePath = path.join(billsDir, fileName);
            const writeStream = fs.createWriteStream(filePath);

            doc.pipe(writeStream);

            // -- CONSTANTS --
            const primaryColor = '#4682B4'; // Steel Blue / Cornflower Blue style
            const black = '#000000';
            const white = '#FFFFFF';
            const grey = '#555555';

            const date = transaction.date ? new Date(transaction.date) : new Date();
            const dateStr = !isNaN(date.getTime()) ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const type = (transaction.type || '').toUpperCase();

            // 1. Header Section
            // Logo
            const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo.jpg');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 40, 40, { width: 60 });
            }

            // Company Info (Left, under logo or next to it? Design shows Company Name top left)
            // Let's put Company Name next to Logo to save vertical space, or under.
            // Design: Logo Top Left, Company Name Text Top Left.
            const headerY = 45;
            const leftX = 110;

            doc.fillColor(black).fontSize(20).font('Helvetica-Bold').text('Nature Farming', leftX, headerY);
            doc.fontSize(10).font('Helvetica')
                .text('Kilinochi, Sri Lanka', leftX, headerY + 25)
                .text('Phone: 0712345678', leftX, headerY + 40)
                .text('Email: info@naturefarming.com', leftX, headerY + 55);

            // Title (Right Aligned)
            doc.fillColor(primaryColor).fontSize(28).font('Helvetica-Bold')
                .text('INVOICE', 350, headerY, { align: 'right', width: 200 });

            doc.fillColor(black).fontSize(10).font('Helvetica');
            doc.text(`Date: ${dateStr}`, 350, headerY + 35, { align: 'right', width: 200 });
            doc.text(`Invoice #: ${transaction.billNumber || 'N/A'}`, 350, headerY + 50, { align: 'right', width: 200 });
            doc.text(`Type: ${type}`, 350, headerY + 65, { align: 'right', width: 200 });

            doc.moveDown(4);

            // 2. Info Columns (Customer | Field Visitor | Details)
            const colTop = 140;
            const colWidth = 170;
            const gap = 10;
            const col1 = 40;
            const col2 = col1 + colWidth + gap;
            const col3 = col2 + colWidth + gap;

            // Headers Background
            doc.rect(col1, colTop, colWidth, 20).fill(primaryColor);
            doc.rect(col2, colTop, colWidth, 20).fill(primaryColor);
            doc.rect(col3, colTop, colWidth, 20).fill(primaryColor);

            // Headers Text
            doc.fillColor(white).fontSize(10).font('Helvetica-Bold');
            doc.text(type === 'BUY' ? 'VENDOR (MEMBER)' : 'CUSTOMER (MEMBER)', col1 + 5, colTop + 5);
            doc.text('FIELD OFFICER', col2 + 5, colTop + 5);
            doc.text('TRANSACTION DETAILS', col3 + 5, colTop + 5);

            // Content
            const contentTop = colTop + 25;
            doc.fillColor(black).fontSize(9).font('Helvetica');

            // Col 1: Member
            doc.text(`Name: ${member.name || 'Unknown'}`, col1, contentTop);
            doc.text(`Phone: ${member.mobile || 'N/A'}`, col1, contentTop + 15);
            doc.text(`Addr: ${member.address || 'N/A'}`, col1, contentTop + 30, { width: colWidth - 5 });

            // Col 2: Field Visitor
            doc.text(`Name: ${fieldVisitor.name || 'Unknown'}`, col2, contentTop);
            doc.text(`Code: ${fieldVisitor.userId || 'N/A'}`, col2, contentTop + 15);
            doc.text(`Phone: ${fieldVisitor.phone || 'N/A'}`, col2, contentTop + 30);

            // Col 3: Details
            doc.text(`Pay Mode: Cash`, col3, contentTop);
            doc.text(`Status: Completed`, col3, contentTop + 15);
            doc.text(`Branch: ${fieldVisitor.area || 'General'}`, col3, contentTop + 30);

            doc.moveDown(4);

            // 3. Items Table
            const tableTop = 230;
            const itemColX = 40;
            const descColX = 90;
            const qtyColX = 330;
            const priceColX = 400;
            const totalColX = 480;

            // Table Header Bar
            doc.rect(40, tableTop, 515, 25).fill(primaryColor);
            doc.fillColor(white).fontSize(10).font('Helvetica-Bold');

            doc.text('SL', itemColX + 5, tableTop + 8);
            doc.text('DESCRIPTION', descColX + 5, tableTop + 8);
            doc.text('QTY', qtyColX + 5, tableTop + 8);
            doc.text('UNIT PRICE', priceColX + 5, tableTop + 8);
            doc.text('AMOUNT', totalColX + 5, tableTop + 8);

            // Table Rows
            doc.fillColor(black).font('Helvetica').fontSize(10);
            let rowY = tableTop + 25;
            const rowHeight = 25;

            // Row 1
            // Vertical Lines (mocking a grid by drawing a big box around content or just row lines)
            // Ideally loop if multiple items, here just one

            doc.text('1', itemColX + 5, rowY + 8);
            doc.text(transaction.productName || 'Unknown Product', descColX + 5, rowY + 8);
            doc.text(`${transaction.quantity || 0} ${transaction.unitType || ''}`, qtyColX + 5, rowY + 8);
            doc.text((transaction.unitPrice || 0).toFixed(2), priceColX + 5, rowY + 8);
            doc.text((transaction.totalAmount || 0).toFixed(2), totalColX + 5, rowY + 8);

            // Vertical lines for the row
            doc.rect(40, rowY, 515, rowHeight).stroke(); // Box around row
            // We could draw vertical lines, but a box per row is cleaner for single item

            // Vertical lines to separate columns manually
            doc.moveTo(descColX, tableTop).lineTo(descColX, rowY + rowHeight).stroke();
            doc.moveTo(qtyColX, tableTop).lineTo(qtyColX, rowY + rowHeight).stroke();
            doc.moveTo(priceColX, tableTop).lineTo(priceColX, rowY + rowHeight).stroke();
            doc.moveTo(totalColX, tableTop).lineTo(totalColX, rowY + rowHeight).stroke();


            // 4. Footer / Totals
            const footerY = rowY + rowHeight + 20;

            // Left: Amount Words / Terms
            doc.rect(40, footerY, 280, 80).stroke(); // Terms Box
            doc.fontSize(10).font('Helvetica-Bold').text('Terms and conditions:', 45, footerY + 5);
            doc.fontSize(8).font('Helvetica').text('1. Goods once sold will not be taken back.\n2. Computer generated invoice.\n3. Verify item quality before purchase.', 45, footerY + 20);

            // Right: Totals
            const totalsX = 340;
            const valueX = 460;

            doc.fontSize(10).font('Helvetica');
            doc.text('Subtotal', totalsX, footerY);
            doc.text((transaction.totalAmount || 0).toFixed(2), valueX, footerY, { align: 'right', width: 90 });

            doc.text('Discount', totalsX, footerY + 15);
            doc.text('0.00', valueX, footerY + 15, { align: 'right', width: 90 });

            doc.font('Helvetica-Bold').fontSize(12);
            doc.text('Total Amount', totalsX, footerY + 35);
            doc.text(`Rs. ${(transaction.totalAmount || 0).toFixed(2)}`, valueX, footerY + 35, { align: 'right', width: 90 });

            // Signature Box (Bottom Right)
            const sigY = footerY + 60;
            doc.rect(totalsX, sigY, 215, 60).stroke();
            doc.fontSize(8).font('Helvetica').text('Seal and signature', totalsX + 10, sigY + 45, { align: 'center', width: 195 });

            // Bottom Center
            doc.fontSize(8).font('Helvetica-Oblique').text('Thanks for doing business with us. Please visit us again!', 0, 750, { align: 'center' });

            // Branding Footer
            doc.fillColor('red').fontSize(10).font('Helvetica-Bold')
                .text('Powered by NatureFarming', 450, 770, { align: 'right' });


            doc.end();

            writeStream.on('finish', () => {
                resolve(`/bills/${fileName}`);
            });
            writeStream.on('error', (err) => {
                reject(err);
            });

        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { generateBillPDF };
