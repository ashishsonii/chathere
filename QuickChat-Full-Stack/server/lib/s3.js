import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import "dotenv/config";

// Setup S3 Client with credentials from environment variables
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Helper function to decode base64 images and upload to AWS S3 bucket
export const uploadToS3 = async (base64Data) => {
    if (!base64Data) return null;

    try {
        // Extract content type and clean base64 data from Data URI format
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error("Invalid base64 string format");
        }

        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
        // Generate a unique file name
        const fileExtension = contentType.split('/')[1] || 'png';
        const key = `uploads/${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;

        const bucketName = process.env.AWS_BUCKET_NAME;
        if (!bucketName) {
            throw new Error("AWS_BUCKET_NAME environment variable is missing.");
        }

        // Upload command
        const uploadParams = {
            Bucket: bucketName,
            Key: key,
            Body: buffer,
            ContentType: contentType
        };

        const command = new PutObjectCommand(uploadParams);
        await s3Client.send(command);

        // Return the direct S3 public URL
        const s3Region = process.env.AWS_REGION || 'us-east-1';
        return `https://${bucketName}.s3.${s3Region}.amazonaws.com/${key}`;
    } catch (error) {
        console.error("AWS S3 Upload Failure:", error.message);
        throw error;
    }
};
