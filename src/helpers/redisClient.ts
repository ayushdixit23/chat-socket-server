import { Redis } from "ioredis";
import { REDIS_URL } from "../utils/envConfig.js";

// Redis Publisher (For sending messages)
const redisPublisher = new Redis(REDIS_URL);

// Redis Subscriber (For receiving messages)
const redisSubscriber = new Redis(REDIS_URL);

redisPublisher.on("connect", () => {
  console.log("Connected to Redis Publisher");
});

redisSubscriber.on("connect", () => {
  console.log("Connected to Redis Subscriber");
});

redisPublisher.on("error", (err: Error) => {
  console.error("Redis Publisher Error:", err);
});

redisSubscriber.on("error", (err: Error) => {
  console.error("Redis Subscriber Error:", err);
});

export { redisPublisher, redisSubscriber };
