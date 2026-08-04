const bcrypt = require('bcryptjs');

const password = process.argv[2];
if (!password) {
  console.error('Uso: node scripts/hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log('Copia este valor en .env como ADMIN_PASSWORD_HASH:');
  console.log(hash);
});
