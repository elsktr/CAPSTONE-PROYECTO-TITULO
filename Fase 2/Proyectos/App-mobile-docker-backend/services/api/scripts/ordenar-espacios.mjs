// Ordena la bodega: junta en un mismo espacio los productos que van juntos, para que al
// escanear la etiqueta de una repisa se vean varios modelos con sus tallas.
//
//   npm run semilla:espacios                              contra http://localhost:3000/api/v1
//   API_URL=https://rockstar-api.onrender.com/api/v1 npm run semilla:espacios
//
// - Las prendas de una banda (poleras, polerones) quedan en un espacio por banda: todas las
//   de Iron Maiden juntas, todas las de Metallica juntas. Los espacios se numeran desde 01
//   dentro de la zona de la categoría, por orden alfabético de la banda.
// - Las demás (chaquetas, pantalones, cinturones) van de a tres por espacio, por orden
//   alfabético, que deja juntas las de un mismo estilo (las de cuero, las de mezclilla).
// - Cada prenda de banda queda con las tallas de la S a la XL: las que le faltan entran como
//   un ingreso a la bodega, en su mismo color.
//
// Trabaja por la API, con la cuenta de Bodega: son los mismos productos que ven la app de
// bodega y la tienda web. Se puede repetir: lo que ya está en su lugar no se toca y una talla
// que ya existe no se vuelve a crear.

import { CUENTAS, clave, iniciarSesion, llamar } from './api-semillas.mjs';

/** Tallas con que queda cada prenda de banda. */
const TALLAS_DE_BANDA = ['S', 'M', 'L', 'XL'];
/** Productos sin banda por espacio. */
const POR_ESPACIO = 3;
/**
 * El servicio exige una foto al dar de alta una talla, pero una talla nueva de un producto
 * que ya existe conserva la foto del producto: esta no se guarda.
 */
const FOTO_HEREDADA = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

const comparar = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' });
const zonaDe = (codigoUbicacion) => /^B-([^-]+)-/.exec(codigoUbicacion)?.[1];
const espacio = (zona, numero) => `B-${zona}-${String(numero).padStart(2, '0')}`;

/** Unidades de una talla nueva: entre 2 y 6, siempre las mismas para el mismo producto y talla. */
function unidades(producto, talla) {
  let suma = 0;
  for (const letra of `${producto}:${talla}`) {
    suma = (suma * 31 + letra.charCodeAt(0)) % 1000;
  }
  return 2 + (suma % 5);
}

/** Un producto por nombre, con sus variantes, su categoría, su banda y su espacio actual. */
function productosDe(variantes) {
  const productos = new Map();
  for (const variante of variantes) {
    let producto = productos.get(variante.producto);
    if (!producto) {
      producto = { nombre: variante.producto, categoria: variante.categoria, banda: variante.banda, variantes: [] };
      productos.set(variante.producto, producto);
    }
    producto.variantes.push(variante);
  }
  return [...productos.values()];
}

/** El espacio de cada producto, según las reglas del encabezado. */
function planDeEspacios(productos) {
  const plan = new Map();
  const porCategoria = Map.groupBy(productos, (p) => p.categoria);
  for (const delaCategoria of porCategoria.values()) {
    const zona = zonaDe(delaCategoria[0].variantes[0].codigoUbicacion);
    const conBanda = delaCategoria.filter((p) => p.banda);
    const sinBanda = delaCategoria.filter((p) => !p.banda).sort((a, b) => comparar(a.nombre, b.nombre));

    const grupos = [...Map.groupBy(conBanda, (p) => clave(p.banda)).values()].sort((a, b) => comparar(a[0].banda, b[0].banda));
    for (let i = 0; i < sinBanda.length; i += POR_ESPACIO) {
      grupos.push(sinBanda.slice(i, i + POR_ESPACIO));
    }
    grupos.forEach((grupo, indice) => {
      for (const producto of grupo) {
        plan.set(producto.nombre, espacio(zona, indice + 1));
      }
    });
  }
  return plan;
}

const token = await iniciarSesion(CUENTAS.bodega);
const variantes = await llamar('GET', '/inventario/variantes', undefined, token);
const productos = productosDe(variantes);

// Tallas que les faltan a las prendas de banda, en el color que ya tienen.
let tallasNuevas = 0;
for (const producto of productos.filter((p) => p.banda)) {
  for (const color of new Set(producto.variantes.map((v) => v.color))) {
    for (const talla of TALLAS_DE_BANDA) {
      if (producto.variantes.some((v) => v.color === color && clave(v.talla) === clave(talla))) {
        continue;
      }
      await llamar(
        'POST',
        '/inventario/productos',
        {
          // La misma clave en cada ejecución: si esta se corta a medias, repetirla no duplica nada.
          claveIdempotencia: `espacios:${clave(producto.nombre)}:${clave(color)}:${clave(talla)}`,
          nombre: producto.nombre,
          categoria: producto.categoria,
          banda: producto.banda,
          talla,
          color,
          cantidad: unidades(producto.nombre, talla),
          ubicacion: 'BODEGA',
          imagen: FOTO_HEREDADA,
        },
        token,
      );
      tallasNuevas++;
    }
  }
}

// Cada producto a su espacio. Mover uno lo mueve con todas sus tallas.
const plan = planDeEspacios(productos);
let movidos = 0;
for (const producto of productos) {
  const destino = plan.get(producto.nombre);
  if (destino && producto.variantes[0].codigoUbicacion !== destino) {
    await llamar('PATCH', `/inventario/variantes/${producto.variantes[0].idVariante}`, { espacio: destino }, token);
    movidos++;
  }
}

// Cómo quedó cada espacio.
const alDia = await llamar('GET', '/inventario/variantes', undefined, token);
const porEspacio = Map.groupBy(productosDe(alDia), (p) => p.variantes[0].codigoUbicacion);
for (const codigo of [...porEspacio.keys()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))) {
  console.log(`${codigo}  ${porEspacio.get(codigo).map((p) => p.nombre).join(' · ')}`);
}
console.log(`\n${tallasNuevas} tallas nuevas, ${movidos} productos cambiados de espacio, ${porEspacio.size} espacios.`);
