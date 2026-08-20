const fs = require('fs');

const backgroundCode = fs.readFileSync('background.js', 'utf8');
const testCode = fs.readFileSync('tests.js', 'utf8');

console.log(backgroundCode.includes('getBilingualLangName'));
