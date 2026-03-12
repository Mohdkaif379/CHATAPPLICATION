require('./config/env');
const express = require('express');
const path = require('path');
const webRoutes = require('./routes/webRoutes');
const sessionMiddleware = require('./config/session');
const { handleUploadErrors } = require('./middleware/authMiddleware');

const app = express();

const rootDir = process.cwd();
console.log('App root directory:', rootDir);
const fs = require('fs');
try {
  console.log('Root directory contents:', fs.readdirSync(rootDir));
} catch (e) {
  console.error('Failed to list root directory:', e.message);
}

app.set('view engine', 'ejs');
app.set('views', path.join(rootDir, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));
app.use(sessionMiddleware);

// Debug middleware to log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/', webRoutes);
app.use(handleUploadErrors);

// Catch-all 404 handler for debugging
app.use((req, res) => {
  console.warn(`[404] No route matched: ${req.method} ${req.url}`);
  res.status(404).send(`Route ${req.url} not found`);
});

module.exports = app;
