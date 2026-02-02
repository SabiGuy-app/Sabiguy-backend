const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "SabiGuy Backend API",
            description: "API documentation for SabiGuy",
            // version: "1.0"
        },
        servers: [
            {
                url: "http://localhost:3000/",
                description: 'Local server',
            },
          
            {
                url: "https://sabiguy-backend.onrender.com/", 
                description: "Production server",
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
                      items: { type: 'number' }
                    }
                  }
                }
              }
            },
            pickupLocation: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                coordinates: { type: 'array', items: { type: 'number' } }
              }
            },
            dropoffLocation: {
              type: 'object',
              properties: {
                address: { type: 'string' },
                coordinates: { type: 'array', items: { type: 'number' } }
              }
            },
            distance: {
              type: 'object',
              properties: {
                value: { type: 'number' },
                unit: { type: 'string', default: 'km' }
              }
            },
            scheduleType: {
              type: 'string',
              enum: ['immediate', 'scheduled']
            },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            budget: { type: 'number' },
            calculatedPrice: { type: 'number' },
            agreedPrice: { type: 'number' },
            status: {
              type: 'string',
              enum: ['pending_providers', 'awaiting_provider_acceptance', 'provider_selected', 'payment_pending', 'paid_escrow', 'in_progress', 'completed', 'cancelled', 'funds_released']
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
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
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', default: false },
            message: { type: 'string' },
            error: { type: 'string' }
          }
        }
      }
      }, 
          security: [
            {
              bearerAuth: [],
            },
          ],
    },
  
    apis: ["./routes/*.js"]
};




const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerUi, swaggerSpec };