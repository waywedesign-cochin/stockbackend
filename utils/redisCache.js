import redis from "../config/redisClient.js";

export async function setRedisCache(key, value, ttl = 900) {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl); // 15 minutes default
  } catch (error) {
    console.error("Redis SET error:", error);
  }
}

export async function getRedisCache(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Redis GET error:", error);
    return null;
  }
}

export async function clearRedisCache(pattern) {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(keys);
  } catch (error) {
    console.error("Redis CLEAR error:", error);
  }
}
