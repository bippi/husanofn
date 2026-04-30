const fs = require('fs');
const path = require('path');

// Load .env.local if it exists (for local development)
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  const envLines = envContent.split('\n');
  envLines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim();
    }
  });
}

const apiKey = process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';

const indexPath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(indexPath, 'utf8');

content = content.replace(
  'YOUR_GOOGLE_MAPS_API_KEY',
  apiKey
);

fs.writeFileSync(indexPath, content);
console.log('✓ API key injected into index.html');
