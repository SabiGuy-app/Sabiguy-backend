const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const app = express();
const connectToDB = require("./utils/db");
const http = require("http");
const socketIO = require("socket.io");
const { swaggerUi, swaggerSpec } = require("./src/config/swagger");
const notificationService = require("./src/services/notification.service");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cors = require("cors");
const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3001",
      "https://sabi-admin-two.vercel.app",
      "https://sabiguy.vercel.app",
    ],
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
});

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3001",
      "https://sabi-admin-two.vercel.app",
      "https://sabiguy.vercel.app",
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
];

app.use(cors());

routes.forEach((route) => {
  app.use(`/api/v1${route.path}`, require(route.file));
});

// Expose raw swagger spec - must come before swaggerUi.serve
app.get("/api-docs/swagger.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json(swaggerSpec);
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCssUrl: "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css",
  customJs: [
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js"
  ],
  swaggerOptions: {
    url: "https://n3yr6d4uxi.execute-api.us-east-1.amazonaws.com/staging/api-docs/swagger.json"
  }
}));

notificationService.setSocketIO(io);

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
      console.log(`💬 ${socket.userType} ${socket.userId} joined chat: ${chatRoom}`);
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
    console.log(`👋 ${socket.userType} ${socket.userId} left chat: ${chatRoom}`);
    socket.to(chatRoom).emit("user_left_chat", {
      userId: socket.userId,
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