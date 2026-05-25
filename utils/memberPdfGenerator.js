const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Detects if a string is valid base64 image data.
 * Handles raw base64, data URIs, and strings with/without padding.
 */
function isBase64Image(str) {
    if (!str || typeof str !== 'string') return false;
    // Remove data URI prefix if present
    const cleaned = str.replace(/^data:image\/\w+;base64,/, '');
    // Check if it looks like base64 (at least 100 chars, valid base64 chars)
    if (cleaned.length < 100) return false;
    return /^[A-Za-z0-9+/\r\n]+=*$/.test(cleaned.substring(0, 200));
}

/**
 * Converts a base64 string to a Buffer for PDFKit image embedding.
 */
function base64ToBuffer(str) {
    if (!str) return null;
    const cleaned = str.replace(/^data:image\/\w+;base64,/, '');
    try {
        return Buffer.from(cleaned, 'base64');
    } catch (e) {
        console.error('base64ToBuffer error:', e.message);
        return null;
    }
}

/**
 * Universal helper to get a Buffer from either Base64 or a Remote URL (S3).
 */
async function getImageBuffer(source) {
    if (!source) return null;
    if (source.startsWith('http')) {
        try {
            const response = await axios.get(source, { responseType: 'arraybuffer' });
            return Buffer.from(response.data, 'binary');
        } catch (e) {
            console.error(`Remote image fetch error (${source}):`, e.message);
            return null;
        }
    }
    if (isBase64Image(source)) {
        return base64ToBuffer(source);
    }
    return null;
}

/**
 * Generates a Member Registration PDF.
 * @param {Object} member - The member document from the database.
 * @returns {Promise<string>} - The relative URL path to the generated PDF.
 */
const generateMemberPDF = (member) => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const membersDir = path.join(__dirname, '..', 'public', 'members');
            if (!fs.existsSync(membersDir)) {
                fs.mkdirSync(membersDir, { recursive: true });
            }

            const fileName = `${member.memberCode || member._id}.pdf`;
            const filePath = path.join(membersDir, fileName);
            const writeStream = fs.createWriteStream(filePath);

            doc.pipe(writeStream);

            // -- CONSTANTS --
            const primaryColor = '#0F766E';
            const black = '#000000';
            const white = '#FFFFFF';
            const grey = '#666666';
            const lightGrey = '#F5F5F5';

            const registeredDate = member.registeredAt ? new Date(member.registeredAt) : new Date();
            const dateStr = !isNaN(registeredDate.getTime())
                ? registeredDate.toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];

            // ====== PAGE 1: HEADER ======
            // Logo
            const logoPath = path.join(__dirname, '..', 'public', 'images', 'nf_logo.jpg');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 40, 35, { width: 55 });
            }

            // Company Info
            doc.fillColor(black).fontSize(18).font('Helvetica-Bold').text('Nature Farming', 105, 40);
            doc.fontSize(9).font('Helvetica').fillColor(grey)
                .text('Kilinochi, Sri Lanka', 105, 62)
                .text('Phone: 024 433 5099 | Email: nfplantation.official.it@gmail.com', 105, 75);

            // Profile Photo (top right)
            if (member.profileImage) {
                try {
                    const profileBuf = await getImageBuffer(member.profileImage);
                    if (profileBuf) {
                        doc.image(profileBuf, 480, 35, { width: 70, height: 80, fit: [70, 80] });
                    }
                } catch (imgErr) {
                    console.error('Profile image error:', imgErr.message);
                }
            }

            // Title Bar
            const titleY = 105;
            doc.rect(40, titleY, 515, 28).fill(primaryColor);
            doc.fillColor(white).fontSize(14).font('Helvetica-Bold')
                .text('MEMBER REGISTRATION CERTIFICATE', 50, titleY + 7, { width: 495, align: 'center' });

            // Member Code + Date Row
            const infoY = titleY + 38;
            doc.fillColor(black).fontSize(10).font('Helvetica-Bold')
                .text(`Member Code: ${member.memberCode || 'N/A'}`, 40, infoY);
            doc.font('Helvetica').text(`Registration Date: ${dateStr}`, 350, infoY, { align: 'right', width: 205 });

            // ====== PERSONAL DETAILS SECTION ======
            let y = infoY + 25;

            const sectionHeader = (title) => {
                doc.rect(40, y, 515, 22).fill('#E8F5E9');
                doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text(title, 50, y + 5);
                y += 28;
            };

            const detailRow = (label, value) => {
                if (!value && value !== 0) return;
                doc.fillColor(grey).fontSize(9).font('Helvetica-Bold').text(`${label}:`, 50, y, { width: 140 });
                doc.fillColor(black).fontSize(9).font('Helvetica').text(String(value), 195, y, { width: 350 });
                y += 16;
            };

            sectionHeader('Personal Details');
            detailRow('Full Name', member.name);
            detailRow('NIC', member.nic);
            detailRow('Mobile', member.mobile);
            detailRow('Email', member.email);
            detailRow('Member Type', member.memberType);
            const feePaidLabel = (member.memberType === 'Old') ? 'Paid' : (member.registrationFeePaid ? 'Paid' : 'Not Paid');
            detailRow('Registration Fee', feePaidLabel);

            // Registration Data (additional form fields)
            const regData = member.registrationData;
            if (regData && typeof regData === 'object') {
                y += 5;
                sectionHeader('Additional Registration Details');

                // Common registration data fields
                const fieldMap = {
                    fullName: 'Full Name',
                    fatherName: "Father's Name",
                    motherName: "Mother's Name",
                    dateOfBirth: 'Date of Birth',
                    gender: 'Gender',
                    maritalStatus: 'Marital Status',
                    religion: 'Religion',
                    nationality: 'Nationality',
                    occupation: 'Occupation',
                    monthlyIncome: 'Monthly Income',
                    location: 'Location',
                    district: 'District',
                    province: 'Province',
                    nomineeName: 'Nominee Name',
                    nomineeNic: 'Nominee NIC',
                    relationship: 'Relationship',
                    nomineeAddress: 'Nominee Address',
                    nomineeMobile: 'Nominee Mobile',
                    bankName: 'Bank Name',
                    bankBranch: 'Bank Branch',
                    accountNumber: 'Account Number',
                    accountHolderName: 'Account Holder',
                };

                for (const [key, label] of Object.entries(fieldMap)) {
                    if (regData[key]) {
                        detailRow(label, regData[key]);
                    }
                }

                // Education details (may be arrays)
                if (regData.educationDetails && Array.isArray(regData.educationDetails)) {
                    y += 5;
                    sectionHeader('Education Details');
                    regData.educationDetails.forEach((edu, i) => {
                        if (typeof edu === 'object') {
                            detailRow(`Education ${i + 1}`, `${edu.qualification || ''} - ${edu.institute || ''} (${edu.year || ''})`);
                        } else {
                            detailRow(`Education ${i + 1}`, String(edu));
                        }
                    });
                }

                // Experience details (may be arrays)
                if (regData.experienceDetails && Array.isArray(regData.experienceDetails)) {
                    y += 5;
                    sectionHeader('Work Experience');
                    regData.experienceDetails.forEach((exp, i) => {
                        if (typeof exp === 'object') {
                            detailRow(`Experience ${i + 1}`, `${exp.position || ''} at ${exp.company || ''} (${exp.duration || ''})`);
                        } else {
                            detailRow(`Experience ${i + 1}`, String(exp));
                        }
                    });
                }

                // Remaining keys not already shown
                // Also exclude image fields (handled separately as actual images, not text)
                const shownKeys = new Set([
                    ...Object.keys(fieldMap),
                    'educationDetails', 'experienceDetails',
                    'idFrontImage', 'idBackImage', 'profileImage', 'signatureImage',
                    'biometricData', 'draftId', 'mobile_normalized',
                ]);
                for (const [key, val] of Object.entries(regData)) {
                    if (shownKeys.has(key)) continue;
                    if (val === null || val === undefined || val === '') continue;
                    if (typeof val === 'object') continue; // Skip complex objects
                    detailRow(key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), val);
                }
            }

            // ====== SIGNATURE ======
            if (y > 650) {
                doc.addPage();
                y = 50;
            }

            y += 10;
            sectionHeader('Signature');

            if (member.signatureImage) {
                try {
                    const sigBuf = await getImageBuffer(member.signatureImage);
                    if (sigBuf) {
                        doc.image(sigBuf, 50, y, { width: 120, height: 50, fit: [120, 50] });
                        y += 55;
                    } else {
                        doc.fillColor(grey).fontSize(9).font('Helvetica').text('(Signature could not be loaded)', 50, y);
                        y += 15;
                    }
                } catch (sigErr) {
                    console.error('Signature image error:', sigErr.message);
                    doc.fillColor(grey).fontSize(9).font('Helvetica').text('(Signature could not be loaded)', 50, y);
                    y += 15;
                }
            } else {
                doc.fillColor(grey).fontSize(9).font('Helvetica').text('(No signature provided)', 50, y);
                y += 15;
            }

            // ====== ID CARD IMAGES ======
            const hasIdFront = !!member.idFrontImage;
            const hasIdBack = !!member.idBackImage;

            if (hasIdFront || hasIdBack) {
                // Start a new page for ID cards if not enough space
                if (y > 450) {
                    doc.addPage();
                    y = 50;
                }

                y += 10;
                sectionHeader('Identification Documents');

                if (hasIdFront) {
                    try {
                        const frontBuf = await getImageBuffer(member.idFrontImage);
                        if (frontBuf) {
                            doc.fillColor(grey).fontSize(9).font('Helvetica-Bold').text('ID Card - Front:', 50, y);
                            y += 15;
                            doc.image(frontBuf, 50, y, { width: 240, height: 150, fit: [240, 150] });
                            y += 155;
                        }
                    } catch (e) {
                        console.error('ID Front image error:', e.message);
                    }
                }

                if (hasIdBack) {
                    if (y > 550) {
                        doc.addPage();
                        y = 50;
                    }
                    try {
                        const backBuf = await getImageBuffer(member.idBackImage);
                        if (backBuf) {
                            doc.fillColor(grey).fontSize(9).font('Helvetica-Bold').text('ID Card - Back:', 50, y);
                            y += 15;
                            doc.image(backBuf, 50, y, { width: 240, height: 150, fit: [240, 150] });
                            y += 155;
                        }
                    } catch (e) {
                        console.error('ID Back image error:', e.message);
                    }
                }
            }

            // ====== FOOTER ======
            doc.fontSize(8).font('Helvetica-Oblique').fillColor(grey)
                .text('This is a computer-generated document. No signature is required for authentication.', 40, 740, { align: 'center', width: 515 });
            doc.fillColor(primaryColor).fontSize(9).font('Helvetica-Bold')
                .text('Powered by Nature Farming', 40, 755, { align: 'center', width: 515 });

            doc.end();

            writeStream.on('finish', () => {
                resolve(`/members/${fileName}`);
            });
            writeStream.on('error', (err) => {
                reject(err);
            });

        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { generateMemberPDF };
