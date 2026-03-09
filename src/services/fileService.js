const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary');

class FileService {
  uploadToCloudinary(fileBuffer, fileName, mimeType) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'auto',
          folder: 'chat_files',
          public_id: `${Date.now()}-${fileName}`,
          use_filename: true,
          unique_filename: true
        },
        (error, result) => {
          if (error) return reject(error);
          return resolve(result);
        }
      );

      const readStream = streamifier.createReadStream(fileBuffer);
      readStream.pipe(uploadStream);
    });
  }
}

module.exports = new FileService();
