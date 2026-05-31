// Find app and BrowserWindow bindings
const fs = require('fs');

// Try electronBinding if it exists
if (typeof process.electronBinding === 'function') {
  console.log('electronBinding exists!');
  // Try common binding names
  ['app', 'browser_window', 'browser_view', 'browser', 'native_image', 'shell', 'screen', 'clipboard', 'ipc', 'dialog', 'menu', 'power_monitor', 'tray'].forEach(name => {
    try {
      const b = process.electronBinding(name);
      console.log(`electronBinding(${name}):`, typeof b, Object.keys(b||{}).slice(0,5));
    } catch(e) {
      console.log(`electronBinding(${name}): error - ${e.message}`);
    }
  });
} else {
  console.log('electronBinding: NOT AVAILABLE (typeof =', typeof process.electronBinding, ')');
}

// Try _linkedBinding for electron-specific bindings
console.log('\n=== _linkedBinding attempts ===');
['electron_common_app', 'electron_browser_app', 'electron_atom_browser_app', 'atom_browser_app',
 'electron_main_app', 'electron_browser_main', 'electron_bindings', 'electron_renderer'].forEach(name => {
  try {
    if (typeof process._linkedBinding === 'function') {
      const b = process._linkedBinding(name);
      console.log(`_linkedBinding(${name}):`, typeof b, typeof b === 'object' ? Object.keys(b).slice(0,10) : b);
    }
  } catch(e) {
    console.log(`_linkedBinding(${name}): NOT FOUND`);
  }
});

// Check electron_common_features for more
if (typeof process._linkedBinding === 'function') {
  try {
    const feat = process._linkedBinding('electron_common_features');
    console.log('\n=== electron_common_features keys ===');
    console.log(Object.keys(feat));
  } catch(e) {}
}

// Check what require actually resolves
const Module = require('module');
console.log('\n=== Module globalPaths ===');
console.log(Module.globalPaths);

// List all cached modules
console.log('\n=== Attempting to get electron via createRequire ===');
try {
  const { createRequire } = require('module');
  const req = createRequire('node:electron');
  console.log('node:electron:', typeof req);
} catch(e) {
  console.log('node:electron error:', e.message);
}

process.exit(0);
