const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config();

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

/**
 * Uploads a base64 encoded image to AWS S3.
 * @param {string} base64Image - The base64 encoded image string.
 * @param {string} folder - The folder in the bucket (e.g., 'members', 'signatures').
 * @returns {Promise<string>} - The URL of the uploaded image.
 */
async function uploadBase64Image(base64Image, folder = "members") {
    if (!base64Image || !base64Image.startsWith("data:image")) {
        // If it's not a base64 image (could be an existing URL or invalid data), return as is
        if (typeof base64Image === 'string' && base64Image.startsWith('http')) {
            return base64Image;
        }
        return base64Image;
    }

    try {
        // Extract format and actual base64 data
        const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error("Invalid base64 image format");
        }

        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        const extension = contentType.split('/')[1] || 'jpg';
        const fileName = `${folder}/${crypto.randomUUID()}.${extension}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: buffer,
            ContentType: contentType
        });

        await s3.send(command);

        const imageUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
        return imageUrl;
    } catch (error) {
        console.error("S3 Upload Error:", error);
        throw error;
    }
}

module.exports = { uploadBase64Image };
