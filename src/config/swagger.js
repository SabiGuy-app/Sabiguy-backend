const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const packageJson = require('../../package.json');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SabiGuy Backend API',
      description: 'API documentation for SabiGuy',
      version: packageJson.version || '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:3000/',
        description: 'Local server',
      },

      {
        url: 'https://sabiguy.onrender.com/',
        description: 'Production server',
      },
      {
        url: 'https://api.nifesi.xyz',
        description: 'AWS server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        MobileUpdatePolicy: {
          type: 'object',
          properties: {
            id: { type: 'string', example: '672a1b2c3d4e5f6789012345' },
            active: { type: 'boolean', example: true },
            platform: { type: 'string', enum: ['ios', 'android', 'both'], example: 'both' },
            update_type: { type: 'string', enum: ['none', 'soft_store_update', 'force_store_update'], example: 'soft_store_update' },
            trigger_timing: { type: 'string', enum: ['app_launch', 'after_login', 'on_home_screen'], example: 'app_launch' },
            minimum_required_version: { type: 'string', example: '1.2.0' },
            latest_version: { type: 'string', example: '1.4.0' },
            title: { type: 'string', example: 'New update available' },
            message: { type: 'string', example: 'A newer version of SabiGuy is available with improvements and fixes.' },
            ios_store_url: { type: 'string', format: 'uri', example: 'https://apps.apple.com/app/idXXXXXXXXX' },
            android_store_url: { type: 'string', format: 'uri', example: 'https://play.google.com/store/apps/details?id=com.xxx.sabiguy' },
            allow_dismiss: { type: 'boolean', example: true },
            updated_at: { type: 'string', format: 'date-time' },
            updated_by: { type: 'string', nullable: true },
          },
        },
        MobileUpdatePolicyInput: {
          type: 'object',
          required: ['active', 'platform', 'update_type', 'trigger_timing', 'minimum_required_version', 'latest_version', 'allow_dismiss'],
          properties: {
            active: { type: 'boolean', example: true },
            platform: { type: 'string', enum: ['ios', 'android', 'both'], example: 'both' },
            update_type: { type: 'string', enum: ['none', 'soft_store_update', 'force_store_update'], example: 'soft_store_update' },
            trigger_timing: { type: 'string', enum: ['app_launch', 'after_login', 'on_home_screen'], example: 'app_launch' },
            minimum_required_version: { type: 'string', example: '1.2.0' },
            latest_version: { type: 'string', example: '1.4.0' },
            title: { type: 'string', example: 'New update available' },
            message: { type: 'string', example: 'A newer version of SabiGuy is available with improvements and fixes.' },
            ios_store_url: { type: 'string', format: 'uri', example: 'https://apps.apple.com/app/idXXXXXXXXX' },
            android_store_url: { type: 'string', format: 'uri', example: 'https://play.google.com/store/apps/details?id=com.xxx.sabiguy' },
            allow_dismiss: { type: 'boolean', example: true },
          },
        },
        Booking: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            userId: { type: 'string' },
            providerId: { type: 'string' },
            serviceType: { type: 'string' },
            subCategory: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            packageImage: { type: 'string', format: 'uri' },
            location: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                coordinates: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', default: 'Point' },
                    coordinates: {
                      type: 'array',
                      items: { type: 'number' },
                    },
                  },
                },
              },
            },
            pickupLocation: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                coordinates: { type: 'array', items: { type: 'number' } },
              },
            },
            dropoffLocation: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                coordinates: { type: 'array', items: { type: 'number' } },
              },
            },
            distance: {
              type: 'object',
              properties: {
                value: { type: 'number' },
                unit: { type: 'string', default: 'km' },
              },
            },
            scheduleType: {
              type: 'string',
              enum: ['immediate', 'scheduled'],
            },
            modeOfDelivery: {
              type: 'string',
              enum: ['Car', 'Bike'],
            },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            budget: { type: 'number' },
            calculatedPrice: { type: 'number' },
            agreedPrice: { type: 'number' },
            status: {
              type: 'string',
              enum: [
                'pending_providers',
                'awaiting_provider_acceptance',
                'provider_selected',
                'payment_pending',
                'paid_escrow',
                'in_progress',
                'completed',
                'cancelled',
                'funds_released',
              ],
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            recipient: { type: 'string' },
            recipientModel: { type: 'string', enum: ['User', 'Provider'] },
            type: { type: 'string' },
            title: { type: 'string' },
            message: { type: 'string' },
            data: { type: 'object' },
            isRead: { type: 'boolean' },
            readAt: { type: 'string', format: 'date-time' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        File: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            filename: { type: 'string' },
            url: { type: 'string' },
            resource_type: { type: 'string' },
            email: { type: 'string' },
            provider: { type: 'string' },
            buyer: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: false },
            message: { type: 'string' },
            error: { type: 'string' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },

  apis: [
    path.join(__dirname, '..', 'modules', 'auth', 'auth.routes.js'),
    path.join(__dirname, '..', 'modules', 'bookings', 'bookings.routes.js'),
    path.join(__dirname, '..', 'modules', 'call', 'call.routes.js'),
    path.join(__dirname, '..', 'modules', 'chat', 'chat.routes.js'),
    path.join(__dirname, '..', 'modules', 'contact', 'contact.routes.js'),
    path.join(__dirname, '..', 'modules', 'fcm', 'fcm.routes.js'),
    path.join(
      __dirname,
      '..',
      'modules',
      'notifications',
      'notifications.routes.js',
    ),
    path.join(__dirname, '..', 'modules', 'payment', 'payment.routes.js'),
    path.join(__dirname, '..', 'modules', 'provider', 'provider.routes.js'),
    path.join(
      __dirname,
      '..',
      'modules',
      'supportChatbot',
      'chatbot.routes.js',
    ),
    path.join(
      __dirname,
      '..',
      'modules',
      'transactions',
      'transactions.routes.js',
    ),
    path.join(__dirname, '..', 'modules', 'files', 'files.routes.js'),
    path.join(__dirname, '..', 'modules', 'users', 'users.routes.js'),
    path.join(__dirname, '..', 'modules', 'categories', 'category.routes.js'),
    path.join(__dirname, '..', 'modules', 'wallet', 'wallet.routes.js'),
    path.join(__dirname, '..', 'modules', 'products', 'product.route.js'),
    path.join(__dirname, '..', 'modules', 'mobile', 'updatePolicy.routes.js'),

    // path.join(__dirname, '..', 'modules', 'admin', 'admin.routes.js'),
    path.join(
      __dirname,
      '..',
      'modules',
      'business',
      'business.auth.routes.js',
    ),
    path.join(__dirname, '..', 'modules', 'business', 'business.routes.js'),
    path.join(__dirname, '..', 'modules', 'business', 'staff.routes.js'),
    path.join(__dirname, '..', 'modules', 'business', 'dashboard.routes.js'),
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerUi, swaggerSpec };
