import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -- \"YourPasswordHere\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log(hash);
