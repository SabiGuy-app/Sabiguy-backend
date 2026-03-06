const express = require("express");
const { submitContactForm } = require("../controllers/contact");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Contact
 *   description: Contact form submission routes
 */

/**
 * @swagger
 * /api/v1/contact/submit:
 *   post:
 *     summary: Submit contact form
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, email, project_description]
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               project_description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Contact form submitted successfully
 *       400:
 *         description: Validation error
 */
router.post("/submit", submitContactForm);

module.exports = router;
