const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const required = ['DATABASE_URL', 'SESSION_SECRET'];

required.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`${key} is required in environment variables.`);
  }
});

if (!process.env.MAX_FILE_SIZE_MB) {
  process.env.MAX_FILE_SIZE_MB = '10';
}
