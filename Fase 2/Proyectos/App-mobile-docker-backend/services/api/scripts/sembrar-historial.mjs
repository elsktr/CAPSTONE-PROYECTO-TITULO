// Historial de ventas de demostración para el modelo predictivo de inversión.
//
//   npm run semilla:historial            crea 26 semanas de ventas simuladas (web y tienda)
//   npm run semilla:historial:quitar     borra solo esas ventas; las reales no se tocan
//   node scripts/sembrar-historial.mjs --rehacer    borra y vuelve a crear
//
// Escribe directo en PostgreSQL (la API registra las ventas siempre con la fecha de hoy):
//   DATABASE_URL=postgres://rockstar:rockstar_dev@localhost:5432/rockstar   (por defecto)
//
// Cada venta queda con su detalle, sus costos y su transacción, igual que una real, y con
// la clave `demo-historial:<n>` para reconocerla. No crea pedidos de despacho ni mueve el
// stock: es historia pasada. Siempre genera lo mismo (semilla fija), con bandas en alza,
// a la baja y estables, categorías que se venden más en la web o en la tienda, y algunos
// productos que dejaron de venderse.

import pg from 'pg';

const URL_BASE = process.env.DATABASE_URL ?? 'postgres://rockstar:rockstar_dev@localhost:5432/rockstar';
const PREFIJO = 'demo-historial:';
const SEMANAS = 26;
const ZONA = 'America/Santiago';

const modo = process.argv.includes('--quitar') ? 'quitar' : process.argv.includes('--rehacer') ? 'rehacer' : 'crear';

/** Generador pseudoaleatorio con semilla: el historial sale igual cada vez. */
function aleatorio(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const azar = aleatorio(2026);
const normal = () => Math.sqrt(-2 * Math.log(1 - azar())) * Math.cos(2 * Math.PI * azar());
/** Poisson por el método de Knuth; λ pequeños, así que basta. */
function poisson(lambda) {
  const limite = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= azar();
  } while (p > limite);
  return k - 1;
}
const entre = (min, max) => min + Math.floor(azar() * (max - min + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

/** Qué parte de cada categoría se vende en la web; el resto, en la tienda. */
const WEB_POR_CATEGORIA = { Poleras: 0.68, Polerones: 0.62, Chaquetas: 0.72, Pantalones: 0.45, Cinturones: 0.25 };
const PESO_TALLA = { XS: 0.06, S: 0.16, M: 0.34, L: 0.28, XL: 0.12, XXL: 0.04 };
/** Las bandas se reparten entre estos perfiles: cambio total en las 26 semanas. */
const PERFILES = [0.8, -0.45, 0, 0.5, 0.1, -0.3];

async function quitar(cliente) {
  const ventas = `SELECT id_venta FROM ventas.ventas WHERE clave_idempotencia LIKE '${PREFIJO}%'`;
  await cliente.query(`DELETE FROM pagos.transacciones WHERE id_venta IN (${ventas})`);
  await cliente.query(`DELETE FROM ventas.costos_venta WHERE id_venta IN (${ventas})`);
  await cliente.query(`DELETE FROM ventas.detalle_venta WHERE id_venta IN (${ventas})`);
  const { rowCount } = await cliente.query(`DELETE FROM ventas.ventas WHERE clave_idempotencia LIKE '${PREFIJO}%'`);
  return rowCount ?? 0;
}

async function crear(cliente) {
  const { rows: variantes } = await cliente.query(`
    SELECT v.id_variante, p.id_producto, p.nombre AS producto, b.nombre AS banda, c.nombre AS categoria,
           t.nombre AS talla, p.precio, p.costo_compra
    FROM inventario.variantes v
    JOIN inventario.productos p ON p.id_producto = v.id_producto
    JOIN inventario.categorias c ON c.id_categoria = p.id_categoria
    LEFT JOIN inventario.bandas b ON b.id_banda = p.id_banda
    JOIN inventario.tallas t ON t.id_talla = v.id_talla
    WHERE v.activo AND p.activo AND p.precio IS NOT NULL
    ORDER BY p.id_producto, v.id_variante`);
  if (variantes.length === 0) throw new Error('No hay productos con precio: carga el catálogo primero.');

  const roles = async (rol) =>
    (
      await cliente.query(
        `SELECT u.id_usuario FROM usuarios.usuarios u JOIN usuarios.roles r USING (id_rol) WHERE r.nombre = $1 AND u.activo ORDER BY 1`,
        [rol],
      )
    ).rows.map((f) => f.id_usuario);
  const vendedores = await roles('VENDEDOR');
  const clientes = await roles('CLIENTE');
  if (vendedores.length === 0 || clientes.length === 0) throw new Error('Se necesita al menos una cuenta de Vendedor y una de Cliente.');

  const medios = Object.fromEntries(
    (await cliente.query('SELECT codigo, id_medio, tasa_comision::float AS tasa FROM pagos.medios_pago')).rows.map((m) => [m.codigo, m]),
  );
  const sala = (await cliente.query(`SELECT id_ubicacion FROM inventario.ubicaciones WHERE nombre = 'SALA_VENTAS'`)).rows[0].id_ubicacion;
  const pagada = (await cliente.query(`SELECT id_estado FROM ventas.estados_venta WHERE codigo = 'PAGADA'`)).rows[0].id_estado;
  const { fin } = (await cliente.query(`SELECT (date_trunc('week', now() AT TIME ZONE '${ZONA}'))::date::text AS fin`)).rows[0];
  const lunes = (semana) => {
    const [a, m, d] = fin.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d - 7 * (SEMANAS - semana)));
  };

  // Perfil de cada producto: popularidad, canal y la tendencia de su banda.
  const bandas = [...new Set(variantes.map((v) => v.banda).filter(Boolean))].sort();
  const tendenciaBanda = new Map(bandas.map((b, i) => [b, PERFILES[i % PERFILES.length]]));
  const productos = new Map();
  for (const v of variantes) {
    if (!productos.has(v.id_producto)) {
      const orden = productos.size;
      productos.set(v.id_producto, {
        // Uno de cada nueve productos dejó de venderse a mitad del periodo.
        corte: orden % 9 === 4 ? entre(8, 14) : SEMANAS,
        popularidad: Math.min(5, Math.max(0.15, Math.exp(-0.2 + 0.75 * normal()))),
        web: Math.min(0.9, Math.max(0.1, (WEB_POR_CATEGORIA[v.categoria] ?? 0.5) + 0.08 * normal())),
        tendencia: v.banda ? tendenciaBanda.get(v.banda) : 0.15,
        tallas: 0,
      });
    }
    productos.get(v.id_producto).tallas += PESO_TALLA[v.talla] ?? 1;
  }

  // Unidades de cada prenda por semana y canal, agrupadas en ventas de 1 a 3 líneas.
  let creadas = 0;
  let unidades = 0;
  for (let semana = 0; semana < SEMANAS; semana++) {
    const estacional = 1 + 0.15 * Math.sin((2 * Math.PI * semana) / 13);
    const lineas = { ECOMMERCE: [], POS: [] };
    for (const v of variantes) {
      const perfil = productos.get(v.id_producto);
      if (semana >= perfil.corte) continue;
      const tendencia = 1 + perfil.tendencia * (semana / (SEMANAS - 1));
      const lambda = perfil.popularidad * ((PESO_TALLA[v.talla] ?? 1) / perfil.tallas) * tendencia * estacional;
      for (let u = poisson(lambda); u > 0; u--) {
        lineas[azar() < perfil.web ? 'ECOMMERCE' : 'POS'].push(v);
      }
    }
    for (const canal of ['ECOMMERCE', 'POS']) {
      const pendientes = lineas[canal].sort(() => azar() - 0.5);
      while (pendientes.length > 0) {
        const venta = pendientes.splice(0, entre(1, 3));
        // La misma prenda dos veces en una venta va como una línea con cantidad 2.
        const porVariante = new Map();
        for (const v of venta) porVariante.set(v.id_variante, { v, cantidad: (porVariante.get(v.id_variante)?.cantidad ?? 0) + 1 });
        const subtotal = [...porVariante.values()].reduce((s, l) => s + l.v.precio * l.cantidad, 0);
        const flete = canal === 'ECOMMERCE' ? elegir([3990, 4990, 5990]) : 0;
        const total = subtotal + flete;
        const medio = medios[canal === 'ECOMMERCE' ? elegir(['WEBPAY_DEBITO', 'WEBPAY_CREDITO']) : elegir(['EFECTIVO', 'DEBITO_PRESENCIAL', 'DEBITO_PRESENCIAL', 'CREDITO_PRESENCIAL'])];
        const comision = Math.round(total * medio.tasa);

        const fecha = lunes(semana);
        fecha.setUTCDate(fecha.getUTCDate() + entre(0, 6));
        const hora = canal === 'POS' ? entre(11, 20) : entre(8, 23);
        const local = `${fecha.toISOString().slice(0, 10)} ${String(hora).padStart(2, '0')}:${String(entre(0, 59)).padStart(2, '0')}:00`;

        creadas++;
        const { rows } = await cliente.query(
          `INSERT INTO ventas.ventas (canal, id_vendedor, id_cliente, id_estado, fecha, total, clave_idempotencia)
           VALUES ($1, $2, $3, $4, $5::timestamp AT TIME ZONE '${ZONA}', $6, $7) RETURNING id_venta, fecha`,
          [
            canal,
            canal === 'POS' ? elegir(vendedores) : null,
            canal === 'ECOMMERCE' || azar() < 0.3 ? elegir(clientes) : null,
            pagada,
            local,
            total,
            `${PREFIJO}${creadas}`,
          ],
        );
        const { id_venta: idVenta, fecha: registrada } = rows[0];
        for (const { v, cantidad } of porVariante.values()) {
          unidades += cantidad;
          await cliente.query(
            `INSERT INTO ventas.detalle_venta (id_venta, id_variante, cantidad, precio_unitario, costo_unitario, id_ubicacion)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [idVenta, v.id_variante, cantidad, v.precio, v.costo_compra, canal === 'POS' ? sala : null],
          );
        }
        await cliente.query(
          'INSERT INTO ventas.costos_venta (id_venta, comision_pago, flete_cobrado, costo_despacho) VALUES ($1, $2, $3, $4)',
          [idVenta, comision, flete, canal === 'ECOMMERCE' ? flete - 500 : null],
        );
        const tarjeta = medio.codigo !== 'EFECTIVO';
        await cliente.query(
          `INSERT INTO pagos.transacciones (id_venta, id_medio, monto, estado, comision, codigo_autorizacion, ultimos_digitos, creado_en, resuelto_en)
           VALUES ($1, $2, $3, 'AUTORIZADA', $4, $5, $6, $7, $7)`,
          [
            idVenta,
            medio.id_medio,
            total,
            comision,
            tarjeta ? String(entre(0, 999999)).padStart(6, '0') : null,
            tarjeta ? String(entre(0, 9999)).padStart(4, '0') : null,
            registrada,
          ],
        );
      }
    }
  }
  return { creadas, unidades, desde: lunes(0).toISOString().slice(0, 10), hasta: fin };
}

const cliente = new pg.Client({ connectionString: URL_BASE });
await cliente.connect();
try {
  await cliente.query('BEGIN');
  const { rows } = await cliente.query(`SELECT count(*)::int AS n FROM ventas.ventas WHERE clave_idempotencia LIKE '${PREFIJO}%'`);
  const existentes = rows[0].n;
  if (modo === 'quitar') {
    const borradas = await quitar(cliente);
    console.log(`Se quitaron ${borradas} ventas de demostración. Las ventas reales no se tocaron.`);
  } else if (existentes > 0 && modo === 'crear') {
    console.log(`Ya hay ${existentes} ventas de demostración. Usa --rehacer para crearlas de nuevo o --quitar para borrarlas.`);
  } else {
    if (existentes > 0) await quitar(cliente);
    const { creadas, unidades, desde, hasta } = await crear(cliente);
    console.log(`Se crearon ${creadas} ventas de demostración (${unidades} unidades) entre el ${desde} y el ${hasta}, sin incluir esa semana.`);
  }
  await cliente.query('COMMIT');
} catch (error) {
  await cliente.query('ROLLBACK');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
