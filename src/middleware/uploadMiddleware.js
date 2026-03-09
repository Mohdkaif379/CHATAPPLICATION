const multer = require('multer');

const maxMb = Number(process.env.MAX_FILE_SIZE_MB || 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxMb * 1024 * 1024
  }
});

module.exports = upload;
