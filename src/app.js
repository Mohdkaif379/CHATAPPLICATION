require('./config/env');
const express = require('express');
const path = require('path');
const webRoutes = require('./routes/webRoutes');
const sessionMiddleware = require('./config/session');
const { handleUploadErrors } = require('./middleware/authMiddleware');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(sessionMiddleware);

app.use('/', webRoutes);
app.use(handleUploadErrors);

module.exports = { app, sessionMiddleware };
