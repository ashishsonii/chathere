import { EC2Client, DescribeInstancesCommand } from "@aws-sdk/client-ec2";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.node1.utf8
dotenv.config({ path: path.resolve('c:/Users/ashis/OneDrive/Desktop/10kchat/QuickChat-Full-Stack/.env.node1.utf8') });

const client = new EC2Client({
  region: process.env.AWS_REGION || "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function checkInstances() {
  try {
    const command = new DescribeInstancesCommand({});
    const response = await client.send(command);
    
    console.log("=== EC2 Instances ===");
    if (!response.Reservations || response.Reservations.length === 0) {
      console.log("No EC2 instances found.");
      return;
    }

    response.Reservations.forEach(reservation => {
      reservation.Instances.forEach(instance => {
        const nameTag = instance.Tags?.find(tag => tag.Key === 'Name');
        const name = nameTag ? nameTag.Value : 'Unnamed';
        
        console.log(`Name: ${name}`);
        console.log(`Instance ID: ${instance.InstanceId}`);
        console.log(`State: ${instance.State?.Name}`);
        console.log(`Public IP: ${instance.PublicIpAddress || 'N/A'}`);
        console.log(`Private IP: ${instance.PrivateIpAddress || 'N/A'}`);
        console.log(`Instance Type: ${instance.InstanceType}`);
        console.log("------------------------");
      });
    });
  } catch (error) {
    console.error("Error fetching EC2 instances:", error);
  }
}

checkInstances();
