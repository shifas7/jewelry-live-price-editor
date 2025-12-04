import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Create and configure Express app
 */
export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve static files from public directory
  app.use(express.static('public'));

  // Root redirect
  app.get('/', (req, res) => {
    res.redirect('/index.html');
  });

  return app;
}

/**
 * Get server port
 */
export function getPort() {
  return process.env.PORT || 3000;
}

