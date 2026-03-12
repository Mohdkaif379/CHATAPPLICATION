require('./config/env');
const express = require('express');
const path = require('path');
const webRoutes = require('./routes/webRoutes');
const sessionMiddleware = require('./config/session');
const { handleUploadErrors } = require('./middleware/authMiddleware');

const app = express();

// Use __dirname to find root reliably regardless of where the app is started
const rootDir = path.resolve(__dirname, '..');
console.log('[DEBUG] Root directory:', rootDir);

const fs = require('fs');
try {
  const contents = fs.readdirSync(rootDir);
  console.log('[DEBUG] Root contents:', contents);
} catch (e) {
  console.error('[ERROR] Failed to list root:', e.message);
}

// Move debug logging to the top to capture ALL requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(rootDir, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));
app.use(sessionMiddleware);

app.use('/', webRoutes);
app.use(handleUploadErrors);

// Catch-all 404 handler
app.use((req, res) => {
  console.warn(`[404] No route matched: ${req.method} ${req.url}`);
  res.status(404).send(`Route ${req.url} not found`);
});

module.exports = app;
