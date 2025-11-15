const express = require ('express');
const { registerBuyer, registerProvider, login, verifyEmail, forgotPassword, resetPassword, googleSignUp, googleSignUpBuyer, googleLogIn} = require ('../controllers/auth');
const router = express.Router();

// const authMiddleware = require ('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication and user management routes
 */

/**
 * @swagger
 * /api/v1/auth/buyer:
 *   post:
 *     summary: Register a new buyer account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name, phoneNumber, address]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 example: "johndoe@example.com"
 *               password:
 *                 type: string
 *                 example: "strongpassword123"
 *               phoneNumber:
 *                 type: string
 *                 example: 12345678
 *               address:
 *                 type: string
 *                 example: "Ibadan"
 *     responses:
 *       201:
 *         description: Buyer registered successfully
 *       400:
 *         description: Invalid request
 */
router.post("/buyer", registerBuyer);

/**
 * @swagger
 * /api/v1/auth/provider:
 *   post:
 *     summary: Register a new service provider account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, phoneNumber]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Queen"
 *               email:
 *                 type: string
 *                 example: "studio@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *               phoneNumber:
 *                 type: string
 *                 example: "12345678"
 *     responses:
 *       201:
 *         description: Provider registered successfully
 *       400:
 *         description: Invalid request
 */
router.post("/provider", registerProvider);

/**
 * @swagger
 * /api/v1/auth/email:
 *   post:
 *     summary: Verify user email after registration
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [otp]
 *             properties:
 *               otp:
 *                 type: string
 *                 example: "309875"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post("/email", verifyEmail);

/**
 * @swagger
 * /api/v1/auth:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       401:
 *         description: Invalid credentials
 */
router.post("/", login);

/**
 * @swagger
 * /api/v1/auth/google-provider:
 *   post:
 *     summary: Register a provider with Google OAuth
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 example: "google-oauth-id-token"
 *     responses:
 *       201:
 *         description: Provider registered via Google
 *       400:
 *         description: Invalid token or user exists
 */
router.post("/google-provider", googleSignUp);

/**
 * @swagger
 * /api/v1/auth/google:
 *   post:
 *     summary: Register a buyer with Google OAuth
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *     responses:
 *       201:
 *         description: Buyer registered via Google
 *       400:
 *         description: Invalid token
 */
router.post("/google", googleSignUpBuyer);

/**
 * @swagger
 * /api/v1/auth/google-login:
 *   post:
 *     summary: Log in user with Google
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 example: "google-oauth-id-token"
 *     responses:
 *       200:
 *         description: Logged in via Google successfully
 *       401:
 *         description: Invalid Google credentials
 */
router.post("/google-login", googleLogIn);

/**
 * @swagger
 * /api/v1/auth/password:
 *   post:
 *     summary: Request password reset link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset link sent
 *       404:
 *         description: User not found
 */
router.post("/password", forgotPassword);

/**
 * @swagger
 * /api/v1/auth/reset:
 *   post:
 *     summary: Reset password using token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "JohnDoe@gmail.com"
 *               otp:
 *                 type: string
 *                 example: "44576"
 *               newPassword:
 *                 type: string
 *                 example: "newStrongPassword123"
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid or expired token
 */
router.post("/reset", resetPassword);



module.exports = router;
