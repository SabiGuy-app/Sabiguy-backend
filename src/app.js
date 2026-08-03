const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { swaggerUi, swaggerSpec } = require('./config/swagger');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const bookingsRoutes = require('./modules/bookings/bookings.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const contactRoutes = require('./modules/contact/contact.routes');
const filesRoutes = require('./modules/files/files.routes');
const notificationRoutes = require('./modules/notifications/notifications.routes');
const paymentRoutes = require('./modules/payment/payment.routes');
const providerRoutes = require('./modules/provider/provider.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const transactionRoutes = require('./modules/transactions/transactions.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const supportChatbotRoutes = require('./modules/supportChatbot/chatbot.routes');
const fcmRoutes = require('./modules/fcm/fcm.routes');
const callRoutes = require('./modules/call/call.routes');

const createApp = () => {
  const app = express();

  app.set('trust proxy', true);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));
  app.use(cors({
    origin: [
      'http://localhost:5173',
      'http://localhost:3001',
      'https://sabi-admin-two.vercel.app',
      'https://sabiguy.vercel.app',
      'https://www.sabiguy.com',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/file', filesRoutes);
  app.use('/api/v1/provider', providerRoutes);
  app.use('/api/v1/users', usersRoutes);
  app.use('/api/v1/contact', contactRoutes);
  app.use('/api/v1/bookings', bookingsRoutes);
  app.use('/api/v1/fcm', fcmRoutes);
  app.use('/api/v1/notifications', notificationRoutes);
  app.use('/api/v1/payment', paymentRoutes);
  app.use('/api/v1/wallet', walletRoutes);
  app.use('/api/v1/transactions', transactionRoutes);
  app.use('/api/v1/chats', chatRoutes);
  app.use('/api/v1/support-chatbot', supportChatbotRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/call', callRoutes);

  app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerSpec);
  });

  app.get(['/api-docs', '/api-docs/'], (req, res) => {
    const apiBaseUrl = process.env.API_BASE_URL || '';
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

  return app;
};

module.exports = {
  createApp,
};
