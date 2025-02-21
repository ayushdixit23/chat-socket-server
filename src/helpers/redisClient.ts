import { Redis } from "ioredis";

// Redis Publisher (For sending messages)
const redisPublisher = new Redis({
  host: "127.0.0.1",
  port: 6379,
});

// Redis Subscriber (For receiving messages)
const redisSubscriber = new Redis({
  host: "127.0.0.1",
  port: 6379,
});

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
