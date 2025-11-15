const express = require ('express');
const router = express.Router();
const multer = require ('multer');
const authMiddleware = require ('../middleware/authMiddleware');
const { uploadFile } = require ('../controllers/uploadFile');

const upload = multer({ dest: 'uploads/' });

router.post('/:email/:category', upload.single('file'), uploadFile);

module.exports = router;