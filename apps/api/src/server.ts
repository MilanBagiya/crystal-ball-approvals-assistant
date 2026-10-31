import path from 'node:path';
import dotenv from 'dotenv';
import { createApp } from './app';

// The .env file lives at the repo root, shared by both apps.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const port = Number(process.env.API_PORT ?? 4000);

createApp().listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
