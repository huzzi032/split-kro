const fs = require('fs');
const content = fs.readFileSync('errors.txt', 'utf16le');
const lines = content.split('\n').filter(line => line.includes('error TS') || line.includes('.tsx') || line.includes('.ts'));
console.log(lines.join('\n'));
