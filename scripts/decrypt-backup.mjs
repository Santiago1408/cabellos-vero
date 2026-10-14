import { webcrypto } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

const [source, destination] = process.argv.slice(2);
if (!source || !destination || !process.stdin.isTTY) {
  process.stderr.write('Uso: node scripts/decrypt-backup.mjs archivo.csv.enc salida.csv\nEjecuta el comando en una terminal interactiva.\n');
  process.exitCode = 1;
} else {
  const silentOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const terminal = createInterface({ input: process.stdin, output: silentOutput, terminal: true });
  let passphrase = '';
  try {
    process.stdout.write('Contraseña del respaldo: ');
    passphrase = await terminal.question('');
    process.stdout.write('\n');
  } finally {
    terminal.close();
  }

  try {
    const file = await readFile(source);
    const header = new TextEncoder().encode('LMCB1');
    if (file.length <= 33 || !file.subarray(0, 5).equals(Buffer.from(header))) {
      throw new Error('Formato de respaldo no reconocido.');
    }
    const salt = Uint8Array.from(file.subarray(5, 21));
    const iv = Uint8Array.from(file.subarray(21, 33));
    const ciphertext = Uint8Array.from(file.subarray(33));
    const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    const key = await webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, material,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    );
    const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: header }, key, ciphertext);
    await writeFile(destination, new Uint8Array(plain), { flag: 'wx', mode: 0o600 });
    process.stdout.write(`CSV descifrado: ${destination}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'No se pudo descifrar el respaldo.'}\n`);
    process.exitCode = 1;
  }
}
