const fs = require('fs');
const path = require('path');

const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';

const indexPath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(indexPath, 'utf8');

content = content.replace(
  'YOUR_GOOGLE_MAPS_API_KEY',
  apiKey
);

fs.writeFileSync(indexPath, content);
console.log('✓ API key injected into index.html');
