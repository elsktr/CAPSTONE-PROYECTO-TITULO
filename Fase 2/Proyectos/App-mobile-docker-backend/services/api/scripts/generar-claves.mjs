// Genera el par de claves RS256 con que la API firma las sesiones, escrito como variables
// de entorno de una sola línea (los saltos de línea quedan como `\n`). Sirve donde la API no
// puede guardar las claves en disco, como el plan gratis de Render: sin ellas, cada reinicio
// genera claves nuevas y cierra todas las sesiones.
//
//   npm run claves      (desde services/api)

import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const enUnaLinea = (pem) => pem.trim().replace(/\n/g, '\\n');

console.log(`JWT_CLAVE_PRIVADA=${enUnaLinea(privateKey)}`);
console.log(`JWT_CLAVE_PUBLICA=${enUnaLinea(publicKey)}`);
