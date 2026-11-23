// Hoja de etiquetas QR para la demostración: una por prenda (talla y color) y una por espacio
// de la bodega, listas para imprimir y escanear con la app de bodega.
//
//   npm run etiquetas                                     contra http://localhost:3000/api/v1
//   API_URL=https://rockstar-api.onrender.com/api/v1 npm run etiquetas
//   SALIDA=otra-hoja.html npm run etiquetas
//
// Los QR llevan lo mismo que imprime la app: la prenda, su SKU (`RS-0001`), y el espacio, su
// código (`B-POL-01`). Al escanear un SKU la app abre la prenda; al escanear un espacio
// muestra lo que se guarda ahí. Lee los datos por la API con la cuenta de Bodega, así que las
// etiquetas coinciden con el ambiente al que apunta. Las prendas desactivadas no se imprimen.

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import qrcode from 'qrcode-generator';

import { API, CUENTAS, escaparXml, iniciarSesion, llamar } from './api-semillas.mjs';

const SALIDA = resolve(process.env.SALIDA ?? 'etiquetas-qr.html');
/** Módulos en blanco alrededor del código, igual que en la app: sin margen los lectores fallan. */
const MARGEN = 3;

const comparar = (a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

/** El QR como SVG, con el mismo nivel de corrección que la app (M). */
function svgQr(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const modulos = qr.getModuleCount();
  const lado = modulos + MARGEN * 2;
  let trazo = '';
  for (let fila = 0; fila < modulos; fila++) {
    for (let columna = 0; columna < modulos; columna++) {
      if (qr.isDark(fila, columna)) {
        trazo += `M${columna + MARGEN},${fila + MARGEN}h1v1h-1z`;
      }
    }
  }
  return (
    `<svg viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="QR ${escaparXml(texto)}">` +
    `<rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="${trazo}"/></svg>`
  );
}

function etiquetaPrenda(v) {
  return `<article class="etiqueta">
  ${svgQr(v.sku)}
  <p class="codigo">${escaparXml(v.sku)}</p>
  <p class="nombre">${escaparXml(v.producto)}</p>
  <p class="detalle">Talla ${escaparXml(v.talla)} · ${escaparXml(v.color)}</p>
  <p class="detalle">Espacio ${escaparXml(v.codigoUbicacion)}</p>
</article>`;
}

function etiquetaEspacio(codigo, variantes) {
  const productos = [...new Set(variantes.map((v) => v.producto))].sort(comparar);
  const lista = productos.slice(0, 4).map(escaparXml).join('<br>');
  const resto = productos.length > 4 ? `<br>y ${productos.length - 4} más` : '';
  return `<article class="etiqueta espacio">
  ${svgQr(codigo)}
  <p class="codigo">${escaparXml(codigo)}</p>
  <p class="detalle">${lista}${resto}</p>
</article>`;
}

function pagina({ prendas, espacios, generado }) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Etiquetas QR — Rockstar</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #111; background: #fff; }
  header { padding: 0 0 6mm; }
  h1 { font-size: 18pt; margin: 0 0 2mm; }
  h2 { font-size: 14pt; margin: 6mm 0 3mm; break-after: avoid; }
  .nota { font-size: 9pt; color: #555; margin: 0; }
  .grilla { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
  .etiqueta { border: 1px dashed #999; border-radius: 2mm; padding: 3mm; text-align: center; break-inside: avoid; }
  .etiqueta svg { display: block; width: 32mm; height: 32mm; margin: 0 auto 2mm; }
  .espacio svg { width: 38mm; height: 38mm; }
  .codigo { font: 700 12pt ui-monospace, Consolas, monospace; margin: 0 0 1mm; letter-spacing: .5px; }
  .nombre { font-size: 9pt; font-weight: 600; margin: 0 0 1mm; }
  .detalle { font-size: 8pt; color: #333; margin: 0; line-height: 1.35; }
  .salto { break-before: page; }
  @media screen { body { padding: 16px; } }
</style>
</head>
<body>
<header>
  <h1>Etiquetas QR para la demostración</h1>
  <p class="nota">${prendas.length} prendas y ${espacios.length} espacios de ${escaparXml(API)} · generado ${escaparXml(generado)}.
  Imprimir al 100&nbsp;% y recortar por la línea punteada. Se escanean desde la app de bodega.</p>
</header>
<h2>Espacios de la bodega</h2>
<section class="grilla">
${espacios.map(([codigo, variantes]) => etiquetaEspacio(codigo, variantes)).join('\n')}
</section>
<h2 class="salto">Prendas</h2>
<section class="grilla">
${prendas.map(etiquetaPrenda).join('\n')}
</section>
</body>
</html>
`;
}

const token = await iniciarSesion(CUENTAS.bodega);
const variantes = await llamar('GET', '/inventario/variantes', undefined, token);
const prendas = variantes
  .filter((v) => v.activo)
  .sort((a, b) => comparar(a.codigoUbicacion, b.codigoUbicacion) || comparar(a.producto, b.producto) || comparar(a.sku, b.sku));

const porEspacio = new Map();
for (const v of prendas) {
  const codigo = v.codigoUbicacion.toUpperCase();
  porEspacio.set(codigo, [...(porEspacio.get(codigo) ?? []), v]);
}
const espacios = [...porEspacio].sort(([a], [b]) => comparar(a, b));

await writeFile(SALIDA, pagina({ prendas, espacios, generado: new Date().toLocaleString('es-CL') }), 'utf8');
console.log(`${prendas.length} etiquetas de prendas y ${espacios.length} de espacios en ${SALIDA}`);
