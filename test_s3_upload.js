const { uploadBase64Image } = require("./services/s3Service");
const fs = require("fs");

async function testUpload() {
    console.log("Starting S3 upload test...");

    // Minimal base64 image (a 1x1 black pixel GIF)
    const base64Image = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    try {
        console.log("Uploading test image...");
        const url = await uploadBase64Image(base64Image, "test");
        console.log("Upload successful!");
        console.log("Uploaded Image URL:", url);

        if (url && url.startsWith("https://")) {
            console.log("TEST PASSED: URL generated correctly.");
        } else {
            console.log("TEST FAILED: Invalid URL generated.");
        }
    } catch (error) {
        console.error("TEST FAILED: Upload error.", error);
    }
}

testUpload();
