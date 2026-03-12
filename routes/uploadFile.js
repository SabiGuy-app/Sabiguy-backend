const express = require ('express');
const router = express.Router();
const multer = require ('multer');
const authMiddleware = require ('../middleware/authMiddleware');
const { uploadFile } = require ('../controllers/uploadFile');

const upload = multer({ dest: 'uploads/' });

/**
 * @swagger
 * /api/v1/file/{email}/{category}:
 *   post:
 *     summary: Upload a file for a user
 *     tags: [Uploads]
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: User email (provider or buyer)
 *         example: user@example.com
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [profile_pictures, work_visuals, identity_docs, certificates]
 *         description: File category (others will be stored as other_files)
 *         example: profile_pictures
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 file:
 *                   $ref: '#/components/schemas/File'
 *       400:
 *         description: Missing email or file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: No file uploaded
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User not found
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Upload failed
 */
router.post('/:email/:category', upload.single('file'), uploadFile);

module.exports = router;
