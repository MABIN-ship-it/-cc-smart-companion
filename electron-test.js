const electron = require('electron');
console.log('typeof electron:', typeof electron);
console.log('keys:', Object.keys(electron).slice(0, 10));
console.log('app:', typeof electron.app);
process.exit(0);
