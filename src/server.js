const http = require('http');
const app = require('./app');
const sessionMiddleware = require('./config/session');
const configureSocket = require('./config/socket');
const initializeDatabase = require('./config/initDb');

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

async function bootstrap() {
  await initializeDatabase();
  configureSocket(server, sessionMiddleware);

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
