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

// Allowed origins for CORS
const allowedOrigins = ["http://localhost:3000", "http://localhost:3001"];

// Initialize Express app
const app = express();

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

  redisSubscriber.on("message", (channel, message) => {
    const receivedMessage = JSON.parse(message);

    if (receivedMessage?.type === "message") {
      io.to(receivedMessage?.roomId).emit("message", receivedMessage);
    } else if (receivedMessage?.type === "typing") {
      io.to(receivedMessage?.roomId).emit("typing", receivedMessage);
    } else if (receivedMessage?.type === "not-typing") {
      io.to(receivedMessage?.roomId).emit("not-typing", receivedMessage);
    }

    if (receivedMessage?.serverId !== PORT) {
      console.log("Redis Message Received:", receivedMessage);
    }
  });

  redisSubscriber.on("error", (err) => {
    console.error("Redis Subscriber Error:", err);
    setTimeout(() => {
      console.log("Reconnecting Redis Subscriber...");
      subscribeToRedis();
    }, 5000); // Retry after 5 seconds
  });
};

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    const decoded = verifyToken(token)

    if (!decoded) {
      return next(new Error("Authentication failed: Invalid token"));
    }
    const { id: userId } = decoded;

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
    await publishToRedis({ ...data, type: "message", serverId: process.env.PORT });
    console.log(`Message sent to RabbitMQ: ${JSON.stringify(data)}`);
    await sendMessage(data);

  });

  socket.on("typing", async (data) => {
    console.log(data)
    await publishToRedis({ ...data, type: "typing", serverId: process.env.PORT });
  });

  socket.on("not-typing", async (data) => {
    console.log(data)
    await publishToRedis({ ...data, type: "not-typing", serverId: process.env.PORT });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Ensure Redis subscription is initialized only once
subscribeToRedis();

// Start server
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
