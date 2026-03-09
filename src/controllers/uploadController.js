const fileService = require('../services/fileService');

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required.' });
    }

    const uploaded = await fileService.uploadToCloudinary(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    return res.status(200).json({
      fileUrl: uploaded.secure_url,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileMime: req.file.mimetype
    });
  } catch (error) {
    return res.status(500).json({ message: 'File upload failed.' });
  }
};
