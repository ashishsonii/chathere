import Redis from "ioredis";
import "dotenv/config";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
    console.error("REDIS_URL environment variable is missing.");
}

const redis = new Redis(redisUrl);

redis.on("connect", () => {
    console.log("Redis Database Connected");
});

redis.on("error", (err) => {
    console.error("Redis Connection Error:", err.message);
});

export default redis;
