const path = require('path');
console.log('process.versions:', JSON.stringify(process.versions, null, 2));
console.log('process.type:', process.type);
console.log('process.resourcesPath:', process.resourcesPath);
console.log('__dirname:', __dirname);
console.log('Electron module path:', require.resolve('electron'));
try {
  const e = require('electron');
  console.log('typeof electron:', typeof e);
  console.log('electron keys:', Object.keys(e).slice(0, 5));
} catch(err) {
  console.log('electron require error:', err.message);
}
process.exit(0);
