SabiGuy Backend API

Backend API for the SabiGuy on-demand services platform.
Version 1.0 — Powered by Node.js, Express, and MongoDB
(OpenAPI 3.0)

 Overview

SabiGuy is an on-demand platform that connects customers (“buyers”) with trusted, pre-vetted service providers (artisans, drivers, cleaners, technicians, etc.).
This backend provides all core APIs for authentication, user management, provider onboarding, and profile/data management.

📌 Base URL
http://localhost:3000/


This is the development/local environment server.

🔐 Authentication

These routes handle user signup, login, OAuth, and account recovery.

POST /api/v1/auth/buyer

Register a new buyer account.

POST /api/v1/auth/provider

Register a new service provider account.

POST /api/v1/auth/email

Verify user email after registration.

POST /api/v1/auth

Log in a user with email and password.

POST /api/v1/auth/google-provider

Sign up a provider using Google OAuth.

POST /api/v1/auth/google

Sign up a buyer using Google OAuth.

POST /api/v1/auth/google-login

Log in user using Google OAuth.

POST /api/v1/auth/password

Request a password-reset email link.

POST /api/v1/auth/reset

Reset password using a valid token.

🛠️ Provider Module

Routes for provider profile setup, business profile, services, and media.

POST /api/v1/provider

Update provider personal profile information.

POST /api/v1/provider/business

Update business details for a provider.

POST /api/v1/provider/job-service

Add or update provider jobs/services.

PUT /api/v1/provider/work-visuals

Upload or update images/videos of the provider’s previous work.

PUT /api/v1/provider/bank-info

Update provider bank or payout details.

PUT /api/v1/provider/profile-pic

Upload or update provider profile picture.

👥 Users (Admin/System Routes)

Used by admin panels or system scripts for user management.

GET /api/v1/users/buyers

Fetch all buyers.

GET /api/v1/users/providers

Fetch all providers with full details.

GET /api/v1/users

Fetch all users (buyers + providers).

GET /api/v1/users/email/{email}

Fetch a single user by email.

GET /api/v1/users/{id}

Fetch a single user by ID.

📦 Tech Stack

Node.js (Express.js)

MongoDB (Mongoose ORM)

JWT Authentication

Cloudinary (media uploads)

Nodemailer / SendGrid (email services)

OpenAPI 3.0 documentation

⚙️ Setup Instructions
1. Clone the repository
git clone https://github.com/Sabi-Guy/sabiguy-backend.git
cd sabiguy-backend

2. Install dependencies
npm install

3. Environment variables

Create a .env file:

PORT=3000
MONGO_URI=your_mongo_connection_string
JWT_SECRET=your_jwt_secret
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
SENDGRID_API_KEY=
EMAIL_FROM=no-reply@sabiguy.com

4. Start development server
npm run dev

📘 API Documentation

A full OpenAPI 3.0 (Swagger) file is available in:

/docs/swagger.yaml


You may also generate Swagger UI using "swagger-ui-express" if needed.

🧪 Testing

You can test endpoints using:

Postman

Insomnia

Thunder Client (VSCode)

📄 License

MIT License — free to use and modify.