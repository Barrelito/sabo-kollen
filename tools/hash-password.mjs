import { hashPassword } from '../server/password.js';

if (process.stdin.isTTY) {
  console.error('Skicka lösenordet via stdin; skriv det inte som kommandoradsargument.');
  process.exit(2);
}

let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/[\r\n]+$/, '');
if (password.length < 12) {
  console.error('Lösenordet måste vara minst 12 tecken.');
  process.exit(2);
}
process.stdout.write(`${hashPassword(password)}\n`);
