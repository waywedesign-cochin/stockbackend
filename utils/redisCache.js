// utils/cache.js
import redisClient from "../config/redisClient.js";

export const setRedisCache = async (key, value, ttl = 600) => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.error("Redis setCache error:", err);
  }
};

export const getRedisCache = async (key) => {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis getCache error:", err);
    return null;
  }
};

export const clearRedisCache = async (pattern) => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  } catch (err) {
    console.error("Redis clearCache error:", err);
  }
};
