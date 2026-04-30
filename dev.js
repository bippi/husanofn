#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Check if .env.local exists
const envLocalPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envLocalPath)) {
  console.error('❌ .env.local file not found!');
  console.error('\nPlease create .env.local with your API key:');
  console.error('\n  GOOGLE_MAPS_API_KEY=your_api_key_here\n');
  console.error('See .env.example for reference.');
  process.exit(1);
}

// Run build
console.log('🔨 Running build...');
require('./build.js');

console.log('✅ Ready for local development!');
console.log('\nOpen index.html in your browser to test locally.');
