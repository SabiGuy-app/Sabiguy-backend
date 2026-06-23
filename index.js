const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const app = express();
const morgan = require("morgan");

app.set("trust proxy", true);

const connectToDB = require("./utils/db");
const http = require("http");
const socketIO = require("socket.io");
const redis = require("redis");
const { createAdapter } = require("@socket.io/redis-adapter");
const { swaggerUi, swaggerSpec } = require("./src/config/swagger");
const notificationService = require("./src/services/notification.service");
const turnService = require("./src/services/turnService");
const REDIS_MAX_RECONNECT_ATTEMPTS = Number(
  process.env.REDIS_MAX_RECONNECT_ATTEMPTS || 5,
);
const REDIS_ERROR_LOG_INTERVAL_MS = Number(
  process.env.REDIS_ERROR_LOG_INTERVAL_MS || 60000,
);

const getErrorMessage = (error) =>
  error?.message || error?.code || error?.name || "Unknown error";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

const cors = require("cors");
const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3001",
      "https://sabi-admin-two.vercel.app",
      "https://sabiguy.vercel.app",
      "https://www.sabiguy.com",
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
});

// Setup Redis adapter for Socket.io
const createThrottledRedisErrorLogger = (clientName) => {
  let lastLoggedAt = 0;
  let suppressedCount = 0;

  return (error) => {
    const now = Date.now();
    const shouldLog = now - lastLoggedAt >= REDIS_ERROR_LOG_INTERVAL_MS;

    if (!shouldLog) {
      suppressedCount += 1;
      return;
    }

    const suppressedMessage =
      suppressedCount > 0
        ? ` (${suppressedCount} similar error(s) suppressed)`
        : "";

    console.error(
      `Redis ${clientName} client error: ${getErrorMessage(error)}${suppressedMessage}`,
    );

    lastLoggedAt = now;
    suppressedCount = 0;
  };
};

const safeDestroyRedisClient = async (client) => {
  try {
    await client.destroy();
  } catch (error) {
    if (error?.name !== "ClientClosedError") {
      throw error;
    }
  }
};

const initRedisAdapter = async () => {
  const redisHost = process.env.REDIS_HOST;
  const redisPort = Number(process.env.REDIS_PORT || 6379);

  if (!redisHost) {
    console.warn(
      "⚠️ REDIS_HOST is not set. Socket.IO will run without the Redis adapter.",
    );
    return;
  }

  const pubClient = redis.createClient({
    socket: {
      host: redisHost,
      port: redisPort,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
      reconnectStrategy: (retries, cause) => {
        if (retries >= REDIS_MAX_RECONNECT_ATTEMPTS) {
          return new Error(
            `Redis reconnect stopped after ${retries} attempt(s): ${getErrorMessage(cause)}`,
          );
        }

        return Math.min(retries * 500, 5000);
      },
    },
  });
  const subClient = pubClient.duplicate();

  pubClient.on("error", createThrottledRedisErrorLogger("pub"));
  subClient.on("error", createThrottledRedisErrorLogger("sub"));

  try {
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("✅ Redis adapter connected to Socket.IO");
  } catch (error) {
    console.warn(
      `⚠️ Redis unavailable. Socket.IO will continue without clustering support: ${error.message}`,
    );
    await Promise.allSettled([
      safeDestroyRedisClient(pubClient),
      safeDestroyRedisClient(subClient),
    ]);
  }
};

initRedisAdapter();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3001",
      "https://sabi-admin-two.vercel.app",
      "https://sabiguy.vercel.app",
      "https://www.sabiguy.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

const routes = [
  { path: "/auth", file: "./routes/auth" },
  { path: "/file", file: "./routes/uploadFile" },
  { path: "/provider", file: "./routes/provider" },
  { path: "/users", file: "./routes/users" },
  { path: "/contact", file: "./routes/contact" },
  { path: "/bookings", file: "./routes/bookings" },
  { path: "/fcm", file: "./routes/fcm.routes" },
  { path: "/notifications", file: "./routes/notifications" },
  { path: "/payment", file: "./routes/payment" },
  { path: "/wallet", file: "./routes/wallet" },
  { path: "/transactions", file: "./routes/transactions" },
  { path: "/chats", file: "./routes/chat" },
  { path: "/support-chatbot", file: "./routes/supportChatbot" },
  { path: "/admin", file: "./routes/admin" },
  { path: "/call", file: "./routes/call" }
];

routes.forEach((route) => {
  app.use(`/api/v1${route.path}`, require(route.file));
});

app.get("/api-docs/swagger.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(swaggerSpec);
});

// app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


app.get(["/api-docs", "/api-docs/"], (req, res) => {
  const apiBaseUrl = process.env.API_BASE_URL;
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>SabiGuy API</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js"></script>
<script>
  SwaggerUIBundle({
    url: "${apiBaseUrl}/api-docs/swagger.json",
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    layout: "StandaloneLayout"
  })
</script>
</body>
</html>`);
});

notificationService.setSocketIO(io);

// Make Socket.io instance available to routes (for broadcasting from cron)
app.set("io", io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: Token required"));
    }
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    socket.userType = decoded.role;
    next();
  } catch (error) {
    next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log(` Client connected: ${socket.id}`);
  console.log(`   User: ${socket.userId} (${socket.userType})`);

  const room = `${socket.userType}:${socket.userId}`;
  socket.join(room);
  console.log(`   Joined room: ${room}`);

  socket.emit("connected", {
    message: "Successfully connected to notification server",
    userId: socket.userId,
    userType: socket.userType,
  });

  socket.on("update_location", async (data) => {
    try {
      if (socket.userType !== "provider") return;
      const { latitude, longitude } = data;
      const Provider = require("./models/ServiceProvider");
      await Provider.findByIdAndUpdate(socket.userId, {
        "currentLocation.coordinates": [longitude, latitude],
        lastLocationUpdate: new Date(),
      });
      console.log(`📍 Provider ${socket.userId} location updated`);
    } catch (error) {
      console.error("Update location error:", error.message);
    }
  });

  socket.on("set_availability", async (data) => {
    try {
      if (socket.userType !== "provider") return;
      const { isAvailable } = data;
      const Provider = require("./models/ServiceProvider");
      await Provider.findByIdAndUpdate(socket.userId, {
        "availability.isAvailable": isAvailable,
        isOnline: true,
      });
      socket.emit("availability_updated", { isAvailable });
      console.log(`🟢 Provider ${socket.userId} availability: ${isAvailable}`);
    } catch (error) {
      console.error("Set availability error:", error.message);
    }
  });

  socket.on("join_chat", async (data) => {
    try {
      const { bookingId } = data;
      const chatService = require("./src/services/chat.service");
      const access = await chatService.canAccessChat(bookingId, socket.userId);
      if (!access.allowed) {
        socket.emit("error", {
          message: "Cannot access this chat - booking not in progress",
        });
        return;
      }
      const chatRoom = `booking:${bookingId}`;
      socket.join(chatRoom);
      console.log(
        `💬 ${socket.userType} ${socket.userId} joined chat: ${chatRoom}`,
      );
      socket.to(chatRoom).emit("user_joined_chat", {
        userId: socket.userId,
        userType: socket.userType,
        bookingId,
      });
      socket.emit("chat_joined", {
        bookingId,
        room: chatRoom,
        chatAvailable: true,
      });
    } catch (error) {
      console.error("Join chat error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("send_message", async (data) => {
    try {
      const { bookingId, message, messageType, attachments } = data;
      const chatService = require("./src/services/chat.service");
      const userModel = socket.userType === "provider" ? "Provider" : "Buyer";
      const result = await chatService.sendMessage(
        bookingId,
        socket.userId,
        userModel,
        { message, messageType, attachments },
      );
      const chatRoom = `booking:${bookingId}`;
      io.to(chatRoom).emit("new_message", {
        bookingId,
        message: result.message,
        sender: {
          id: socket.userId,
          type: socket.userType,
        },
      });
      console.log(`📨 Message sent in ${chatRoom}`);
    } catch (error) {
      console.error("Send message error:", error);
      socket.emit("error", { message: error.message });
    }
  });

  socket.on("typing", (data) => {
    const { bookingId, isTyping } = data;
    const chatRoom = `booking:${bookingId}`;
    socket.to(chatRoom).emit("user_typing", {
      userId: socket.userId,
      userType: socket.userType,
      isTyping,
    });
  });

  socket.on("mark_read", async (data) => {
    try {
      const { bookingId } = data;
      const chatService = require("./src/services/chat.service");
      await chatService.markAsRead(bookingId, socket.userId);
      const chatRoom = `booking:${bookingId}`;
      socket.to(chatRoom).emit("messages_read", {
        userId: socket.userId,
        bookingId,
      });
    } catch (error) {
      console.error("Mark read error:", error);
    }
  });

  socket.on("mark_notification_read", async (data) => {
    try {
      const { notificationId } = data;
      await notificationService.markAsRead(notificationId);
      socket.emit("notification_read", { notificationId });
    } catch (error) {
      console.error("Mark notification read error:", error.message);
    }
  });

  socket.on("leave_chat", (data) => {
    const { bookingId } = data;
    const chatRoom = `booking:${bookingId}`;
    socket.leave(chatRoom);
    console.log(
      `👋 ${socket.userType} ${socket.userId} left chat: ${chatRoom}`,
    );
    socket.to(chatRoom).emit("user_left_chat", {
      userId: socket.userId,
    });
  });


// Replace your existing call:initiate and call:offer with this single event
socket.on("call:initiate", async ({ bookingId, targetId, targetType, offer }) => {
  try {
    const iceServers = await turnService.getIceServers();
    const receiverRoom = `${targetType}:${targetId}`;

    // Forward everything in one shot — no race condition
    io.to(receiverRoom).emit("call:incoming", {
      bookingId,
      callerId: socket.userId,
      callerType: socket.userType,
      iceServers,
      offer,                    // ← offer included from the start
    });

    // Confirm to caller with ICE servers
    socket.emit("call:initiated", { bookingId, iceServers });

    console.log(`📞 Call initiated: ${socket.userId} → ${targetId} [booking: ${bookingId}]`);
  } catch (error) {
    console.error("call:initiate error:", error.message);
    socket.emit("error", { message: "Failed to initiate call" });
  }
});

// call:offer event no longer needed — remove it

// 2. Receiver answers the call
socket.on("call:answer", (data) => {
  const { bookingId, callerId, callerType, answer } = data;
  const callerRoom = `${callerType}:${callerId}`;

  io.to(callerRoom).emit("call:answered", {
    bookingId,
    answer,                   // SDP answer from receiver's browser
    answererId: socket.userId,
  });

  console.log(`✅ Call answered: ${socket.userId} → ${callerId} [booking: ${bookingId}]`);
});

// 3. Exchange ICE candidates (WebRTC handshake)
socket.on("call:ice-candidate", (data) => {
  const { bookingId, targetId, targetType, candidate } = data;
  const targetRoom = `${targetType}:${targetId}`;

  io.to(targetRoom).emit("call:ice-candidate", {
    bookingId,
    candidate,                // ICE candidate from browser
    fromId: socket.userId,
  });
});

// 4. Receiver rejects the call
socket.on("call:reject", (data) => {
  const { bookingId, callerId, callerType } = data;
  const callerRoom = `${callerType}:${callerId}`;

  io.to(callerRoom).emit("call:rejected", {
    bookingId,
    rejectedBy: socket.userId,
  });

  console.log(`❌ Call rejected by ${socket.userId} [booking: ${bookingId}]`);
});

// 5. Either party ends the call
socket.on("call:end", (data) => {
  const { bookingId, targetId, targetType } = data;
  const targetRoom = `${targetType}:${targetId}`;

  io.to(targetRoom).emit("call:ended", {
    bookingId,
    endedBy: socket.userId,
  });

  console.log(`📵 Call ended by ${socket.userId} [booking: ${bookingId}]`);
});

// Forward SDP answer to caller (rename your existing call:answer)
socket.on("call:answer", ({ bookingId, targetId, targetType, answer }) => {
  io.to(`${targetType}:${targetId}`).emit("call:answer", {
    bookingId,
    answer,
    fromId: socket.userId,
    fromType: socket.userType,
  });
});

  socket.on("disconnect", async () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    console.log(`   User: ${socket.userId}`);
    if (socket.userType === "provider") {
      try {
        const Provider = require("./models/ServiceProvider");
        await Provider.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
        });
        console.log(`🔴 Provider ${socket.userId} went offline`);
      } catch (error) {
        console.error("Update offline status error:", error.message);
      }
    }
  });

  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

Port = process.env.PORT;

server.listen(Port, () => {
  console.log(`Server is running on port ${Port}`);
});

connectToDB();
