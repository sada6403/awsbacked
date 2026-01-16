const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const billsDir = path.join(publicDir, 'bills');

if (!fs.existsSync(publicDir)) {
    console.log('Creating public directory...');
    fs.mkdirSync(publicDir);
}

if (!fs.existsSync(billsDir)) {
    console.log('Creating bills directory...');
    fs.mkdirSync(billsDir);
}

console.log('Directories checked successfully.');
