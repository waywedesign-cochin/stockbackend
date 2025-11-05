// utils/redisClient.js
import Redis from "ioredis";

const redis = new Redis(process.env.UPSTASH_REDIS_URL, {
  tls: {}, // required for Upstash secure connection
});

// ✅ Log when connected
redis.on("connect", () => {
  console.log("✅ Redis connected");
});

// ❌ Log errors
redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

// 🔄 Log reconnect attempts
redis.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting...");
});

export default redis;
