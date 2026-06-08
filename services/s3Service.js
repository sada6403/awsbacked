const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/**
 * Saves a base64 encoded image to local disk (replaces AWS S3).
 * Returns a public URL path served by Express static middleware.
 */
async function uploadBase64Image(base64Image, folder = "members") {
    if (!base64Image || !base64Image.startsWith("data:image")) {
        if (typeof base64Image === "string" && base64Image.startsWith("http")) {
            return base64Image;
        }
        return base64Image;
    }

    const matches = base64Image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error("Invalid base64 image format");
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const extension = contentType.split("/")[1] || "jpg";
    const fileName = `${crypto.randomUUID()}.${extension}`;

    const folderPath = path.join(UPLOADS_DIR, folder);
    ensureDir(folderPath);

    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${folder}/${fileName}`;
}

module.exports = { uploadBase64Image };
