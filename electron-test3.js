const fs = require('fs');
const path = require('path');

// Write results to a file since we might get killed before seeing all output
const results = [];

// Check all possible electron module paths
results.push('process.versions.electron: ' + process.versions.electron);
results.push('process.versions.chrome: ' + process.versions.chrome);
results.push('process.resourcesPath: ' + process.resourcesPath);

// Try the module._resolveFilename to see if it's patched
const Module = require('module');
const origResolve = Module._resolveFilename;
results.push('Module._resolveFilename is native: ' + (origResolve.toString().includes('[native code]')));

// Check if there's a built-in electron module
try {
  const resolvedPath = Module._resolveFilename('electron', module, false);
  results.push('electron resolves to: ' + resolvedPath);
} catch(e) {
  results.push('electron resolve error: ' + e.message);
}

// Check builtinModules
const builtins = require('module').builtinModules || [];
results.push('# builtinModules: ' + builtins.length);
results.push('electron in builtins: ' + builtins.includes('electron'));

// Write results
const outPath = path.join(__dirname, 'electron_diag.txt');
fs.writeFileSync(outPath, results.join('\n'), 'utf-8');
console.log('Results written to:', outPath);
results.forEach(r => console.log(r));
process.exit(0);
