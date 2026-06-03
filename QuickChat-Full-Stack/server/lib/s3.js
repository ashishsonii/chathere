import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

// Helper function to generate a secure pre-signed URL for a given S3 URL or key
export const getPresignedUrl = async (s3UrlOrKey) => {
    if (!s3UrlOrKey) return s3UrlOrKey;

    let key = s3UrlOrKey;
    if (s3UrlOrKey.includes(".amazonaws.com/")) {
        try {
            const parsed = new URL(s3UrlOrKey);
            key = decodeURIComponent(parsed.pathname.slice(1));
        } catch (e) {
            return s3UrlOrKey;
        }
    }

    // Only generate signed URLs for S3 keys matching our uploads directory structure
    if (!key.startsWith("uploads/")) {
        return s3UrlOrKey;
    }

    try {
        const bucketName = process.env.AWS_BUCKET_NAME;
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        // Pre-signed URL valid for 24 hours (86400 seconds)
        return await getSignedUrl(s3Client, command, { expiresIn: 86400 });
    } catch (error) {
        console.error("Error generating pre-signed S3 URL:", error.message);
        return s3UrlOrKey;
    }
};

// Helper to sign the profile picture URL of a user object
export const signUser = async (user) => {
    if (!user) return user;

    // Convert mongoose document to plain JS object if applicable
    const userObj = (typeof user.toObject === "function") ? user.toObject() : { ...user };

    if (userObj.profilePic) {
        userObj.profilePic = await getPresignedUrl(userObj.profilePic);
    }
    return userObj;
};

// Helper to sign the image URL of a message object
export const signMessage = async (msg) => {
    if (!msg) return msg;

    // Convert mongoose document to plain JS object if applicable
    const msgObj = (typeof msg.toObject === "function") ? msg.toObject() : { ...msg };

    if (msgObj.image) {
        msgObj.image = await getPresignedUrl(msgObj.image);
    }
    return msgObj;
};
