import express from "express";
import { NODE_ENV, PORT } from "./utils/envConfig.js";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { createServer } from "http";
import { Server } from "socket.io";
import { errorMiddleware } from "./middlewares/errors/errorMiddleware.js";
import { CustomError } from "./middlewares/errors/CustomError.js";
import sendMessage from "./helpers/rabbitmq-producer.js";
import { redisPublisher, redisSubscriber } from "./helpers/redisClient.js";
import { verifyToken } from "./utils/jwt.js";
import client from "prom-client";

// Allowed origins for CORS
const allowedOrigins = ["http://localhost:3000", "http://localhost:3001", "https://chat-app-seven-rho-22.vercel.app"];

// Initialize Express app
const app = express();

const register = new client.Registry();

// Default metrics (like CPU, memory usage)
client.collectDefaultMetrics({ register });

// Custom metrics
const connectedClients = new client.Gauge({
  name: "socket_connected_clients",
  help: "Number of currently connected socket clients",
});

register.registerMetric(connectedClients);

const messagesReceived = new client.Counter({
  name: "socket_messages_received",
  help: "Total number of messages received",
});

register.registerMetric(messagesReceived);


const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middlewares
app.use(helmet()); // Security headers

// Logging based on environment (development/production)
const logFormat = NODE_ENV === "development" ? "dev" : "combined";
app.use(morgan(logFormat));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json());

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"], // Allowed HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
    credentials: true, // Allow cookies to be sent
  })
);

// Prometheus metrics route
app.get("/metrics", async (_, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// Routes
app.get("/", (_, res) => {
  res.send("Socket server is running!");
});

app.get("/api/data", (_, res) => {
  // Send data from the server
  res.status(200).json({ message: "Data from the server" });
});

app.get("/api/error", (_, res) => {
  // throw your custom error like this
  throw new CustomError("This is a custom error", 400);
});

// 404 Handler for non-existent routes (must come after routes)
app.use((_, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error Handling Middleware (must come after routes and 404 handler)
app.use(errorMiddleware);

// Redis Publish Function
const publishToRedis = async (message: any) => {
  try {
    await redisPublisher.publish("chat_channel", JSON.stringify(message));
    console.log("Message published to Redis:", message);
  } catch (err) {
    console.error("Redis Publish Error:", err);
  }
};

// Redis Subscribe Function (Runs Once)
const subscribeToRedis = () => {
  redisSubscriber.subscribe("chat_channel");
  redisSubscriber.subscribe("online_users_update");

  redisSubscriber.on("message", async (channel, message) => {
    const receivedMessage = JSON.parse(message);

    if (channel === "chat_channel") {
      if (receivedMessage?.messageType === "message") {
        io.to(receivedMessage?.roomId).emit("message", receivedMessage);
        if (typeof receivedMessage?.receiverId == "string") {
          io.to(receivedMessage?.receiverId).emit(
            "user-messages",
            receivedMessage
          )
        } else {
          receivedMessage?.receiverId.forEach((rId: string) => {
            io.to(rId).emit(
              "user-messages",
              receivedMessage
            )
          })
        }

      } else if (receivedMessage?.messageType === "typing") {
        io.to(receivedMessage?.roomId).emit("typing", receivedMessage);
      } else if (receivedMessage?.messageType === "not-typing") {
        io.to(receivedMessage?.roomId).emit("not-typing", receivedMessage);
      } else if (receivedMessage?.messageType === "messageToSeen") {
        const messages = receivedMessage.messages.map((d: any) => d.mesId);
        const stringifyMessages = JSON.stringify(messages);
        io.to(receivedMessage?.roomId).emit(
          "mark-message-seen",
          stringifyMessages
        );
      } else if (receivedMessage?.messageType === "message:deleted") {
        io.to(receivedMessage?.roomId).emit(
          "message:deleted-update",
          receivedMessage
        );
      } else if (receivedMessage?.messageType === "block-user") {
        io.to(receivedMessage?.roomId)
          .emit("block-user-update", receivedMessage);
      } else if (receivedMessage?.messageType === "messageSeenForGroup") {
        io.to(receivedMessage?.roomId).emit("messageSeenForGroupUpdate", receivedMessage);
      }
    }

    // online user channel
    if (channel == "online_users_update") {
      if (
        receivedMessage.type === "connect" ||
        receivedMessage.type === "disconnect"
      ) {
        // Fetch updated list of online users
        const onlineUsers = await redisPublisher.smembers("online_users");
        io.emit("online-users", onlineUsers);
      } else if (receivedMessage.type === "user-in-chat") {
        const usersInRoom = await redisPublisher.smembers(
          `chat_room:${receivedMessage.roomId}`
        );
        const otherUsers = usersInRoom.filter(
          (id) => id !== receivedMessage.userId
        );
        if (otherUsers && otherUsers.length > 0) {
          otherUsers.forEach((userId) => {
            io.to(userId).emit("is-present-in-chat", {
              isPresent: true,
              roomId: receivedMessage.roomId,
              userId: receivedMessage.userId,
            });

            io.to(userId).emit("get-groupusers-update", {
              users: usersInRoom,
              roomId: receivedMessage.roomId,
              userId: receivedMessage.userId,
            });
          });
        }
      } else if (receivedMessage.type === "user-left-chat") {
        const usersInRoom = receivedMessage.users

        console.log(usersInRoom, "userinroom")

        if (usersInRoom && usersInRoom.length > 0) {
          usersInRoom.forEach((userId: any) => {
            io.to(userId).emit("is-present-in-chat", {
              isPresent: false,
              roomId: receivedMessage.roomId,
              userId: receivedMessage.userId,
            });

            io.to(userId).emit("get-groupusers-update", {
              users: usersInRoom,
              roomId: receivedMessage.roomId,
              userId: receivedMessage.userId,
            });
          });
        }
      } else if (receivedMessage.type === "user-checking-chat") {
        io.to(receivedMessage.roomId).emit("is-present-in-chat", {
          isPresent: receivedMessage.isPresent,
          roomId: receivedMessage.roomId,
          userId: receivedMessage.userId,
        });
      } else if (receivedMessage.type === "check-users-for-group") {
        io.to(receivedMessage.roomId).emit("get-users-for-group-without-me", {
          users: receivedMessage.users,
          roomId: receivedMessage.roomId,
          userId: receivedMessage.userId,
        });
      }
    }
    if (receivedMessage?.serverId !== PORT) {
      // console.log("Redis Message Received:", receivedMessage);
    }
  });

  redisSubscriber.on("error", (err) => {
    console.error("Redis Subscriber Error:", err);
    setTimeout(() => {
      console.log("Reconnecting Redis Subscriber...");
      subscribeToRedis();
    }, 5000);
  });
};

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    const decoded = verifyToken(token);

    if (!decoded) {
      return next(new Error("Authentication failed: Invalid token"));
    }
    const { id: userId } = decoded;

    // @ts-ignore
    socket.userId = userId;

    // Add user to Redis and notify all instances
    await redisPublisher.sadd("online_users", userId);
    await redisPublisher.publish(
      "online_users_update",
      JSON.stringify({ type: "connect", userId })
    );

    if (userId) {
      socket.join(userId);
      return next();
    }

    return next(new Error("Authentication failed: Missing sessionID"));
  } catch (error) {
    console.error("Error in socket middleware:", error);
    return next(new Error("Internal server error"));
  }
});

// Socket.IO Logic
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("message", async (data) => {
    console.log("Received message at socket server:", data);
    await publishToRedis({
      ...data,
      messageType: "message",
      serverId: process.env.PORT,
    });
    console.log(`Message sent to RabbitMQ: ${JSON.stringify(data)}`);
    await sendMessage(data, "insert");
  });

  socket.on("join-room", async (roomId) => {
    if (!roomId) return;

    socket.join(roomId);
    //@ts-ignore
    console.log(`User ${socket.userId} joined room: ${roomId}`);

    // Add user to Redis room set
    //@ts-ignore
    await redisPublisher.sadd(`chat_room:${roomId}`, socket.userId);

    // Publish event to notify other instances
    await redisPublisher.publish(
      "online_users_update",
      JSON.stringify({
        type: "user-in-chat",
        roomId,
        //@ts-ignore
        userId: socket.userId,
      })
    );
  });

  socket.on("leave-room", async (roomId) => {
    if (!roomId) return;

    socket.leave(roomId);
    //@ts-ignore
    console.log(`User ${socket.userId} left room: ${roomId}`);

    // Remove user from Redis room set
    //@ts-ignore
    await redisPublisher.srem(`chat_room:${roomId}`, socket.userId);

    // Check if the room is empty, if so, delete it
    const usersInRoom = await redisPublisher.smembers(`chat_room:${roomId}`);
    if (usersInRoom.length === 0) {
      await redisPublisher.del(`chat_room:${roomId}`); // Cleanup empty rooms
    }

    // Publish event to notify all instances
    await redisPublisher.publish(
      "online_users_update",
      JSON.stringify({
        type: "user-left-chat",
        roomId,
        //@ts-ignore
        userId: socket.userId,
        users: usersInRoom
      })
    );
  });

  socket.on("check-user-in-chat", async (data) => {
    const { roomId, userId } = data;
    const isPresent = await redisPublisher.sismember(
      `chat_room:${roomId}`,
      userId
    );

    await redisPublisher.publish(
      "online_users_update",
      JSON.stringify({
        type: "user-checking-chat",
        roomId,
        isPresent: isPresent ? true : false,
        //@ts-ignore
        userId: socket.userId,
      })
    );
  });

  socket.on("messageToSeen", async (data) => {
    await sendMessage(data, "update");
    const parsedData = JSON.parse(data);
    await publishToRedis({
      ...parsedData,
      messageType: "messageToSeen",
      serverId: process.env.PORT,
    });
  });

  socket.on("typing", async (data) => {
    await publishToRedis({
      ...data,
      messageType: "typing",
      serverId: process.env.PORT,
    });
  });

  socket.on("not-typing", async (data) => {
    await publishToRedis({
      ...data,
      messageType: "not-typing",
      serverId: process.env.PORT,
    });
  });

  socket.on("clear:chat", async (data) => {
    await sendMessage(data, "update");
  })

  socket.on("message:deleted", async ({ roomId, userId, mesId, action }) => {
    if (action === "deleteForEveryOne") {
      await publishToRedis({
        roomId,
        userId,
        mesId,
        messageType: "message:deleted",
        serverId: process.env.PORT,
      });
    }

    const data = {
      roomId,
      userId,
      mesId,
      actionType: "deletion",
      action,
    };
    const stringifyMessgae = JSON.stringify(data);

    await sendMessage(stringifyMessgae, "update");
  });

  socket.on("block:user", async (data) => {
    await publishToRedis({
      ...data, messageType: "block-user",
      serverId: process.env.PORT,
    })
    const payload = JSON.stringify(data)
    await sendMessage(payload, "update")
  })

  socket.on("messageSeenForGroup", async (data) => {
    await publishToRedis({
      ...data,
      messageType: "messageSeenForGroup",
      serverId: process.env.PORT
    })
  })

  socket.on("check-users-for-group", async (data) => {
    const usersInRoom = await redisPublisher.smembers(`chat_room:${data?.roomId}`);
    const users = usersInRoom.filter((d) => d !== data?.userId)
    await redisPublisher.publish("online_users_update", JSON.stringify({ users, ...data, type: "check-users-for-group", serverId: process.env.PORT }))
  })

  socket.on("disconnect", async () => {
    // @ts-ignore
    console.log("Client disconnected:", socket.userId);

    // @ts-ignore
    await redisPublisher.srem("online_users", socket.userId);
    await redisPublisher.publish(
      "online_users_update",
      // @ts-ignore
      JSON.stringify({ type: "disconnect", userId: socket.userId })
    );
  });
});

// Ensure Redis subscription is initialized only once
subscribeToRedis();

// Start server
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
