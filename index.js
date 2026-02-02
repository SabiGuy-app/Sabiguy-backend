const express = require ('express');
const app = express();
const dotenv = require('dotenv');
const connectToDB = require ('./utils/db')
const http = require ('http');
const socketIO = require ('socket.io');
const { swaggerUi, swaggerSpec } = require ('./src/config/swagger');
const notificationService = require ('./src/services/notification.service')
app.use (express.json());
app.use(express.urlencoded({ extended: true }));

const cors = require ("cors");
const server = http.createServer(app)
dotenv.config()

const io = socketIO(server, {
  cors: {
   origin: ["http://localhost:5173", "https://sabiguy-frontend.vercel.app"],
  allowedHeaders: ["Content-Type", "Authorization"],
   methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
   credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000
});
app.use(
  cors({
    origin: ["http://localhost:5173", "https://sabiguy-frontend.vercel.app"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],

    credentials: true,
  })
);


const routes = [
   { path: '/auth', file: './routes/auth'},
   { path: '/file', file: './routes/uploadFile'},
   { path: '/provider', file: './routes/provider'},
   { path: '/users', file: './routes/users'},
   { path: '/bookings', file: './routes/bookings'},
   { path: '/fcm', file: './routes/fcm.routes'},
   { path: '/notifications', file: './routes/notifications'},
   { path: '/payment', file: './routes/payment'},
   { path: '/wallet', file: './routes/wallet'},

];
app.use(cors());

routes.forEach(route => {
  app.use(`/api/v1${route.path}`, require(route.file));
});

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
  }),
);


app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

notificationService.setSocketIO(io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;

    if(!token) {
      return next(new Error('Authentication error: Token required'));
    }

    const jwt = require ('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    socket.userId = decoded.id;
    socket.userType = decoded.role;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'))   
  }
});

io.on('connection', (socket) => {
  console.log(` Client connected: ${socket.id}`);
  console.log(`   User: ${socket.userId} (${socket.userType})`);

  // Join user-specific room
  const room = `${socket.userType}:${socket.userId}`;
  socket.join(room);
  console.log(`   Joined room: ${room}`);

  socket.emit('connected', {
    message: 'Successfully connected to notification server',
    userId: socket.userId,
    userType: socket.userType
  });

  socket.on('update_location', async (data) => {
    try {
      if (socket.userType !== 'provider') return;

      const { latitude, longitude } = data;
      
      // Update provider location in database
      const Provider = require ('./models/ServiceProvider')
      await Provider.findByIdAndUpdate(socket.userId, {
        'currentLocation.coordinates': [longitude, latitude],
        lastLocationUpdate: new Date()
      });

      console.log(`📍 Provider ${socket.userId} location updated`);
    } catch (error) {
      console.error('Update location error:', error.message);
    }
  });
  socket.on('set_availability', async (data) => {
    try {
      if (socket.userType !== 'provider') return;

      const { isAvailable } = data;
      
      const Provider = require('./models/ServiceProvider');
      await Provider.findByIdAndUpdate(socket.userId, {
        'availability.isAvailable': isAvailable,
        isOnline: true
      });

      socket.emit('availability_updated', { isAvailable });
      console.log(`🟢 Provider ${socket.userId} availability: ${isAvailable}`);
    } catch (error) {
      console.error('Set availability error:', error.message);
    }
  });

  // Handle typing indicators (for chat feature)
  socket.on('typing', (data) => {
    const { bookingId, isTyping } = data;
    // Notify the other party
    socket.to(`booking:${bookingId}`).emit('user_typing', {
      userId: socket.userId,
      isTyping
    });
  });
  socket.on('mark_notification_read', async (data) => {
    try {
      const { notificationId } = data;
      await notificationService.markAsRead(notificationId);
      socket.emit('notification_read', { notificationId });
    } catch (error) {
      console.error('Mark notification read error:', error.message);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    console.log(`   User: ${socket.userId}`);

    // Update provider online status
    if (socket.userType === 'provider') {
      try {
        const Provider = require('./models/ServiceProvider');
        await Provider.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date()
        });
        console.log(`🔴 Provider ${socket.userId} went offline`);
      } catch (error) {
        console.error('Update offline status error:', error.message);
      }
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

Port = process.env.PORT

app.listen (Port, () => {
   console.log(`Server is running on port ${Port}`)
});

connectToDB();