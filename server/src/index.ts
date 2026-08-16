import { config } from './config.js';
import { createApp } from './app.js';

createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
