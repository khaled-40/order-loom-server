const fs = require('fs');

const json = fs.readFileSync(
    './order-loom-firebase-adminsdk-fbsvc-bb0433841f.json',
    'utf8'
);

const base64 = Buffer
    .from(JSON.stringify(JSON.parse(json)))
    .toString('base64')
    .replace(/\r?\n|\r/g, ''); // REMOVE ALL RETURNS

fs.writeFileSync('FB_SERVICE_KEY.txt', base64); 