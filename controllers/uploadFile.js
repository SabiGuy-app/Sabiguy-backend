const cloudinary = require ('../src/cloudinary.js');
const File = require ('../models/File');
const fs = require ('fs');
const Provider = require ('../models/ServiceProvider');
const Buyer = require ('../models/ServiceUser.js');

exports.uploadFile = async (req, res) => {
    try {
    const { email, category: rawCategory } = req.params;
        const allowedCategories = ['profile_pictures', 'work_visuals', 'identity_docs', 'certificates'];
        const category = allowedCategories.includes(rawCategory) 
        ? req.params.category : 'other_files';


        if (!email) {
         return res.status(400).json({ message: 'Email is compulsory' });
        }
        let user = await Provider.findOne({ email });
        let role = 'provider';

         if (!user) {
      user = await Buyer.findOne({ email });
      role = 'buyer';
    }

        if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const filePath = req.file.path;

    const result = await cloudinary.uploader.upload(filePath, {
        folder: `SabiGuy/${role}/${category}`,
        resource_type: 'auto',
    });

    fs.unlinkSync(filePath);

    const filePayload = {
        filename: req.file.originalname,
        url: result.secure_url,
        resource_type: result.resource_type,
        email,
    };
    
    if (role === 'provider') {
      filePayload.provider = user._id;
    } else if ( role === 'buyer') {
      filePayload.buyer = user._id;
    }

    const savedFile = await File.create(filePayload);

    if (role === 'provider') {
  await Provider.findByIdAndUpdate(user._id, { $push: { files: savedFile._id } });
} else if (role === 'buyer') {
  await Buyer.findByIdAndUpdate(user._id, { $push: { files: savedFile._id } });
}
    res.status(201).json({ success: true, file: savedFile});

    } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};