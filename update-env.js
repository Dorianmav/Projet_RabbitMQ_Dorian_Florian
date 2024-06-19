const fs = require('fs');
const path = require('path');

const envFilePath = path.join(__dirname, '.env');

const newEnvContent = `DATABASE_PORT=24000

DATABASE_URL="postgresql://postgres:postgres@localhost:24000/projet-rabbit-bd?schema=public"
`;

fs.writeFile(envFilePath, newEnvContent, (err) => {
  if (err) {
    console.error('Error writing to .env file', err);
  } else {
    console.log('.env file has been updated');
  }
});
