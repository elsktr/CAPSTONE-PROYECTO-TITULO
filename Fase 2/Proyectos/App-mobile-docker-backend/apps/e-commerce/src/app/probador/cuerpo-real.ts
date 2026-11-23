import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { MedidasCuerpo, Sexo, TipoPrenda } from '../data/probador';

/**
 * Cuerpo realista del probador y sus prendas: el cuerpo de MakeHuman y ropa de conjuntos de
 * MakeHuman (CC0), exportados desde Blender (`blender/exportar_probador.py`) con las mismas
 * deformaciones de altura, peso y contornos.
 *
 * Las deformaciones se aplican en el procesador y luego se recalculan las normales, para que la
 * luz siga la forma también en los cuerpos más alejados del promedio. Qué tanto aplicar cada una
 * sale de las tablas medidas en Blender (el JSON junto al cuerpo), con el mismo cálculo que
 * `resolver()` del script. Como las prendas tienen las mismas deformaciones, calzan con el cuerpo.
 *
 * El modelo de cada prenda es el de su tipo (polera, pantalón...): toda prenda nueva de la tienda
 * de un tipo conocido se muestra con ese modelo y con el color de su variante.
 */

const CONTORNOS = ['pecho', 'cintura', 'cadera'] as const;
type Parametro = 'altura' | 'peso' | 'volumen' | (typeof CONTORNOS)[number];

interface Fila {
  valor: number;
  altura: number;
  pecho: number;
  cintura: number;
  cadera: number;
}

/** Cómo le queda la prenda del modelo al cuerpo promedio, medido en Blender (cm). */
interface AjustePrenda {
  /** Contorno con que se midió la holgura: pecho en las de arriba, cadera en pantalones. */
  medida: 'pecho' | 'cadera';
  holgura: number;
  alturaMedida: number;
  largoVertical: number;
  bordeInferior: number;
}

interface PrendaCalibrada {
  archivo: string;
  parte: 'arriba' | 'abajo';
  ajuste: AjustePrenda;
  /** Vértices del cuerpo que quedan bajo la prenda: se ocultan, como hace MakeHuman con su ropa. */
  ocultos: number[];
}

interface Calibracion {
  sexo: Sexo;
  formas: string[];
  /** `volumen` falta en los modelos anteriores a esa variante. */
  tablas: Record<Exclude<Parametro, 'volumen'>, Fila[]> & { volumen?: Fila[] };
  prendas: Partial<Record<TipoPrenda, PrendaCalibrada>>;
}

/** Una malla con sus deformaciones, lista para deformarse en el procesador. */
interface MallaDeformable {
  base: Float32Array;
  /** Desplazamiento de cada vértice por forma (relativo a la base), por nombre de forma. */
  formas: Map<string, Float32Array>;
  indices: THREE.BufferAttribute | null;
  uv: THREE.BufferAttribute | null;
  material: THREE.MeshStandardMaterial | null;
}

/** Cuerpo de un sexo, con las tablas de calibración. */
export interface ModeloReal {
  sexo: Sexo;
  cuerpo: MallaDeformable;
  calibracion: Calibracion;
}

const RUTA = 'assets/probador';
/**
 * Puesta, una prenda de arriba mide en vertical, del hombro a la basta, un 90 % de su largo
 * medido en plano: la tela se reparte sobre el hombro y el pecho.
 */
const CAIDA_PUESTA = 0.9;
/** Holgura máxima de la pretina de un pantalón sobre la cintura, en centímetros (como si llevara cinturón). */
const HOLGURA_PRETINA = 4;
/** Holgura máxima con que se dibuja la cadera de un pantalón, en centímetros. */
const HOLGURA_MAXIMA_DIBUJADA = 14;
const modelos = new Map<Sexo, Promise<ModeloReal>>();
const prendas = new Map<string, Promise<MallaDeformable[]>>();

/** Todas las mallas de un .glb (una por material), con sus deformaciones. */
async function cargarMallas(ruta: string): Promise<MallaDeformable[]> {
  const gltf = await new GLTFLoader().loadAsync(ruta);
  const mallas: MallaDeformable[] = [];
  gltf.scene.traverse((objeto) => {
    if (!(objeto instanceof THREE.Mesh)) return;
    const { geometry, morphTargetDictionary, material } = objeto;
    const deltas = geometry.morphAttributes['position'] ?? [];
    const formas = new Map<string, Float32Array>();
    for (const [nombre, indice] of Object.entries(morphTargetDictionary ?? {})) {
      formas.set(nombre, new Float32Array((deltas[indice] as THREE.BufferAttribute).array));
    }
    mallas.push({
      base: new Float32Array(geometry.getAttribute('position').array),
      formas,
      indices: geometry.getIndex(),
      uv: (geometry.getAttribute('uv') as THREE.BufferAttribute | undefined) ?? null,
      material: (Array.isArray(material) ? material[0] : material) as THREE.MeshStandardMaterial,
    });
  });
  if (!mallas.length) throw new Error(`El modelo ${ruta} no tiene mallas`);
  return mallas;
}

/** Recuerda una carga en curso o terminada; si falla, la olvida para poder reintentar. */
function recordar<T>(cache: Map<string, Promise<T>>, clave: string, cargar: () => Promise<T>): Promise<T> {
  let pendiente = cache.get(clave);
  if (!pendiente) {
    pendiente = cargar();
    pendiente.catch(() => cache.delete(clave));
    cache.set(clave, pendiente);
  }
  return pendiente;
}

/** Carga (una sola vez por sexo) el cuerpo y sus tablas. */
export function cargarModeloReal(sexo: Sexo): Promise<ModeloReal> {
  return recordar(modelos as Map<string, Promise<ModeloReal>>, sexo, async () => {
    const [mallas, calibracion] = await Promise.all([
      cargarMallas(`${RUTA}/cuerpo-${sexo}.glb`),
      fetch(`${RUTA}/cuerpo-${sexo}.json`).then((r) => {
        if (!r.ok) throw new Error(`No se encontró la calibración del cuerpo ${sexo}`);
        return r.json() as Promise<Calibracion>;
      }),
    ]);
    return { sexo, cuerpo: mallas[0]!, calibracion };
  });
}

/** Si hay modelo realista para un tipo de prenda (el cinturón se arma sobre el cuerpo). */
export function tieneModeloReal(modelo: ModeloReal, tipo: TipoPrenda): boolean {
  return tipo === 'cinturon' || Boolean(modelo.calibracion.prendas[tipo]);
}

/** Carga (una sola vez) el modelo de un tipo de prenda para el sexo del cuerpo. */
export function cargarPrendaReal(modelo: ModeloReal, tipo: TipoPrenda): Promise<MallaDeformable[]> {
  const prenda = modelo.calibracion.prendas[tipo];
  if (!prenda) return Promise.reject(new Error(`No hay modelo realista de ${tipo}`));
  return recordar(prendas, `${modelo.sexo}:${tipo}`, () => cargarMallas(`${RUTA}/${prenda.archivo}`));
}


function interpolar(filas: Fila[], campo: keyof Fila, valor: number): number {
  for (let i = 0; i < filas.length - 1; i++) {
    const a = filas[i]!;
    const b = filas[i + 1]!;
    if (a.valor <= valor && valor <= b.valor) {
      const t = (valor - a.valor) / (b.valor - a.valor);
      return a[campo] + (b[campo] - a[campo]) * t;
    }
  }
  return valor < filas[0]!.valor ? filas[0]![campo] : filas[filas.length - 1]![campo];
}

/** Valor del parámetro con el que la medida llega a `objetivo` en la tabla. */
function invertir(filas: { valor: number; medida: number }[], objetivo: number): number {
  for (let i = 0; i < filas.length - 1; i++) {
    const a = filas[i]!;
    const b = filas[i + 1]!;
    if (Math.min(a.medida, b.medida) <= objetivo && objetivo <= Math.max(a.medida, b.medida) && a.medida !== b.medida) {
      const t = (objetivo - a.medida) / (b.medida - a.medida);
      return a.valor + (b.valor - a.valor) * t;
    }
  }
  return objetivo < filas[0]!.medida ? filas[0]!.valor : filas[filas.length - 1]!.valor;
}

/** Hasta qué valor la deformación de cadera se aplica entera, y qué parte de lo que pase de ahí. */
const CADERA_PLENA = 1;
const EXCESO_CADERA = 0.3;

/** Cuánto aplicar de cada parámetro (con signo) y la escala final, para un cuerpo dado. */
export function resolverCuerpo(calibracion: Calibracion, cuerpo: MedidasCuerpo): { valores: Record<Parametro, number>; escala: number } {
  const { tablas } = calibracion;
  const peso = Math.min(Math.max((cuerpo.imc - 17) / 14, 0), 1) * 2 - 1;
  // Pasado el tope del peso de MakeHuman (IMC 31), el volumen engrosa brazos, piernas y cuello.
  const volumen = tablas.volumen ? Math.min(Math.max((cuerpo.imc - 31) / 12, 0), 1) : 0;
  const altura = invertir(tablas.altura.map((f) => ({ valor: f.valor, medida: f.altura })), cuerpo.altura);
  const escala = cuerpo.altura / interpolar(tablas.altura, 'altura', altura);
  const valores = { altura, peso, volumen } as Record<Parametro, number>;
  for (const m of CONTORNOS) {
    const base = interpolar(tablas[m], m, 0);
    const porVolumen = tablas.volumen ? interpolar(tablas.volumen, m, volumen) - base : 0;
    const sinControl = base + (interpolar(tablas.altura, m, altura) - base) + (interpolar(tablas.peso, m, peso) - base) + porVolumen;
    const diferencia = cuerpo[m] / escala - sinControl;
    valores[m] = invertir(tablas[m].map((f) => ({ valor: f.valor, medida: f[m] - base })), diferencia);
  }
  // La deformación de cadera solo abulta el costado de los muslos: en una persona baja y de mucho
  // peso, que pide todo su rango, dibujaba alforjas y la tela las copiaba. El exceso se dibuja a
  // medias; la talla y el ajuste se siguen calculando con la medida real.
  if (valores.cadera > CADERA_PLENA) valores.cadera = CADERA_PLENA + (valores.cadera - CADERA_PLENA) * EXCESO_CADERA;
  return { valores, escala };
}

/** Posiciones de una malla deformada para unos valores de parámetros, ya escaladas. */
function deformar(malla: MallaDeformable, valores: Record<Parametro, number>, escala: number): Float32Array {
  const posiciones = new Float32Array(malla.base);
  for (const [parametro, valor] of Object.entries(valores)) {
    for (const [sentido, peso] of [['mas', Math.max(valor, 0)], ['menos', Math.max(-valor, 0)]] as const) {
      const delta = malla.formas.get(`${parametro}_${sentido}`);
      if (!delta || peso === 0) continue;
      for (let i = 0; i < posiciones.length; i++) posiciones[i]! += delta[i]! * peso;
    }
  }
  for (let i = 0; i < posiciones.length; i++) posiciones[i]! *= escala;
  return posiciones;
}

/**
 * Promedia las normales de los vértices que ocupan el mismo punto. El modelo duplica los vértices
 * en las costuras de sus texturas, y sin esto cada lado se sombrea por su cuenta y se ve una línea.
 */
function unirCosturas(resultado: THREE.BufferGeometry, posiciones: Float32Array): void {
  const normales = resultado.getAttribute('normal');
  const grupos = new Map<string, number[]>();
  for (let i = 0; i < posiciones.length; i += 3) {
    const clave = `${Math.round(posiciones[i]! * 5000)},${Math.round(posiciones[i + 1]! * 5000)},${Math.round(posiciones[i + 2]! * 5000)}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(i / 3);
    else grupos.set(clave, [i / 3]);
  }
  const suma = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    suma.set(0, 0, 0);
    for (const v of grupo) suma.add(normal.fromBufferAttribute(normales, v));
    suma.normalize();
    for (const v of grupo) normales.setXYZ(v, suma.x, suma.y, suma.z);
  }
}

function geometria(malla: MallaDeformable, posiciones: Float32Array): THREE.BufferGeometry {
  const resultado = new THREE.BufferGeometry();
  resultado.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  if (malla.uv) resultado.setAttribute('uv', malla.uv.clone());
  if (malla.indices) resultado.setIndex(malla.indices.clone());
  resultado.computeVertexNormals();
  unirCosturas(resultado, posiciones);
  return resultado;
}

/** Posiciones del cuerpo deformado para unas medidas. */
export function posicionesCuerpo(modelo: ModeloReal, cuerpo: MedidasCuerpo): Float32Array {
  const { valores, escala } = resolverCuerpo(modelo.calibracion, cuerpo);
  return deformar(modelo.cuerpo, valores, escala);
}

/** Qué piel queda cubierta por la prenda puesta: se oculta para que nunca asome por la tela. */
export interface Cobertura {
  ocultos: number[];
  cubre: (x: number, y: number, z: number) => boolean;
}

/** Malla del cuerpo deformado, con material de maniquí y sin la piel que cubre la prenda. */
export function crearCuerpoReal(modelo: ModeloReal, posiciones: Float32Array, coberturas: Cobertura[] = []): THREE.Mesh {
  const resultado = geometria(modelo.cuerpo, posiciones);
  if (coberturas.length && resultado.getIndex()) recortarPiel(resultado, coberturas);
  const material = new THREE.MeshPhysicalMaterial({ color: '#d8cfc4', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.6 });
  return new THREE.Mesh(resultado, material);
}

/** Pasos con que se busca, a lo largo de un lado de un triángulo, dónde empieza la prenda. */
const PASOS_RECORTE = 8;

/**
 * Quita la piel que cubre la prenda. Los triángulos que quedan a medias se recortan en el borde de
 * la prenda: en un abdomen grande la piel se estira, y un triángulo de varios centímetros que
 * cruzaba la basta quedaba entero y asomaba por la tela, como un trozo roto sobre ella.
 */
function recortarPiel(geometriaPiel: THREE.BufferGeometry, coberturas: Cobertura[]): void {
  const indices = geometriaPiel.getIndex()!;
  const posicion = geometriaPiel.getAttribute('position');
  const normal = geometriaPiel.getAttribute('normal');
  const uv = geometriaPiel.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const p = posicion.array as Float32Array;
  // La piel se oculta si la cubre cualquiera de las prendas puestas.
  const conjuntos = coberturas.map((c) => ({ ocultos: new Set(c.ocultos), cubre: c.cubre }));
  const oculto = (v: number) => conjuntos.some((c) => c.ocultos.has(v) && c.cubre(p[v * 3]!, p[v * 3 + 1]!, p[v * 3 + 2]!));

  const nuevas: { a: number; b: number; t: number }[] = [];
  const cortes = new Map<string, number>();
  // Punto del lado entre `a` (oculto) y `b` (visible) donde termina la prenda, o -1 si `b` queda
  // fuera de la prenda que oculta a `a` (el borde de lo que cubre).
  const corte = (a: number, b: number): number => {
    const clave = `${a},${b}`;
    const guardado = cortes.get(clave);
    if (guardado !== undefined) return guardado;
    const prenda = conjuntos.find((c) => c.ocultos.has(a) && c.ocultos.has(b) && c.cubre(p[a * 3]!, p[a * 3 + 1]!, p[a * 3 + 2]!));
    let resultado = -1;
    if (prenda) {
      let tapado = 0;
      let libre = 1;
      for (let paso = 0; paso < PASOS_RECORTE; paso++) {
        const t = (tapado + libre) / 2;
        const punto = [0, 1, 2].map((k) => p[a * 3 + k]! + (p[b * 3 + k]! - p[a * 3 + k]!) * t) as [number, number, number];
        if (prenda.cubre(...punto)) tapado = t;
        else libre = t;
      }
      resultado = posicion.count + nuevas.length;
      nuevas.push({ a, b, t: tapado });
    }
    cortes.set(clave, resultado);
    return resultado;
  };

  const visibles: number[] = [];
  for (let t = 0; t < indices.count; t += 3) {
    const v = [indices.getX(t), indices.getX(t + 1), indices.getX(t + 2)];
    const tapados = v.map(oculto);
    const cuenta = tapados.filter(Boolean).length;
    if (cuenta === 3) continue;
    if (cuenta === 0) {
      visibles.push(...v);
      continue;
    }
    // Se rota el triángulo (sin cambiar su orden) para que el vértice distinto quede primero.
    const distinto = tapados.findIndex((x) => (cuenta === 1 ? x : !x));
    const [a, b, c] = [v[distinto]!, v[(distinto + 1) % 3]!, v[(distinto + 2) % 3]!];
    if (cuenta === 1) {
      // `a` oculto: queda el cuadrilátero b, c y los cortes hacia `a`.
      const ca = corte(a, c);
      const ba = corte(a, b);
      if (ca < 0 || ba < 0) visibles.push(a, b, c);
      else visibles.push(b, c, ca, b, ca, ba);
    } else {
      // `a` visible: queda el triángulo de `a` hasta los cortes.
      const ab = corte(b, a);
      const ac = corte(c, a);
      if (ab < 0 || ac < 0) visibles.push(a, b, c);
      else visibles.push(a, ab, ac);
    }
  }

  if (nuevas.length) {
    const total = posicion.count + nuevas.length;
    const mezclar = (origen: ArrayLike<number>, ancho: number) => {
      const destino = new Float32Array(total * ancho);
      destino.set(origen as Float32Array);
      nuevas.forEach(({ a, b, t }, n) => {
        for (let k = 0; k < ancho; k++) destino[(posicion.count + n) * ancho + k] = origen[a * ancho + k]! + (origen[b * ancho + k]! - origen[a * ancho + k]!) * t;
      });
      return destino;
    };
    const normales = mezclar(normal.array, 3);
    for (let n = posicion.count; n < total; n++) {
      const largo = Math.hypot(normales[n * 3]!, normales[n * 3 + 1]!, normales[n * 3 + 2]!) || 1;
      for (let k = 0; k < 3; k++) normales[n * 3 + k]! /= largo;
    }
    geometriaPiel.setAttribute('position', new THREE.BufferAttribute(mezclar(p, 3), 3));
    geometriaPiel.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
    if (uv) geometriaPiel.setAttribute('uv', new THREE.BufferAttribute(mezclar(uv.array, 2), 2));
  }
  geometriaPiel.setIndex(visibles);
}

/** Deja de dibujar lo que la prenda de arriba tapa: así el pantalón nunca asoma por la tela. */
export function ocultarTapado(grupo: THREE.Group, cubre: Cobertura['cubre']): void {
  grupo.traverse((hijo) => {
    if (!(hijo instanceof THREE.Mesh)) return;
    const g = hijo.geometry as THREE.BufferGeometry;
    const indices = g.getIndex();
    if (!indices) return;
    const p = g.getAttribute('position');
    const tapado = (v: number) => cubre(p.getX(v), p.getY(v), p.getZ(v));
    const visibles: number[] = [];
    for (let t = 0; t < indices.count; t += 3) {
      const a = indices.getX(t);
      const b = indices.getX(t + 1);
      const c = indices.getX(t + 2);
      if (!(tapado(a) && tapado(b) && tapado(c))) visibles.push(a, b, c);
    }
    g.setIndex(visibles);
  });
}

/** Medidas de la talla de la prenda, en centímetros, y su color. */
export interface TallaPrenda {
  tipo: TipoPrenda;
  /** Contorno de la prenda: pecho en las de arriba, cintura en pantalones. */
  contorno: number;
  /** Largo del cuerpo de la prenda, o largo de pierna en pantalones. */
  largo: number;
  color: string;
  /** Si la tela se sube cuando la talla no rodea el cuerpo. */
  seSube?: boolean;
}

/** Material de cada tipo de prenda, con el relieve de tela del modelo y el color del producto. */
function materialPrenda(tipo: TipoPrenda, malla: MallaDeformable, color: THREE.Color): THREE.MeshPhysicalMaterial {
  const cuero = tipo === 'chaqueta';
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: cuero ? 0.42 : 0.95,
    metalness: 0,
    clearcoat: cuero ? 0.35 : 0,
    clearcoatRoughness: 0.5,
    sheen: cuero ? 0 : 0.3,
    sheenRoughness: 0.9,
    sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.25),
    normalMap: malla.material?.normalMap ?? null,
    normalScale: new THREE.Vector2(0.8, 0.8),
    side: THREE.DoubleSide,
  });
}

/**
 * Prenda del modelo puesta sobre el cuerpo deformado y ajustada a la talla. La parte principal
 * lleva el color del producto; las secundarias (la camisa bajo una chaqueta) un tono neutro.
 */
export function crearPrendaReal(
  modelo: ModeloReal,
  mallas: MallaDeformable[],
  cuerpo: MedidasCuerpo,
  talla: TallaPrenda,
  posicionesDelCuerpo?: Float32Array,
  /** Prendas ya puestas debajo (el pantalón bajo una polera): esta queda por fuera de ellas. */
  debajo: THREE.Group[] = [],
): { grupo: THREE.Group; cobertura: Cobertura } {
  const calibrada = modelo.calibracion.prendas[talla.tipo]!;
  const { valores, escala } = resolverCuerpo(modelo.calibracion, cuerpo);
  const partes = mallas.map((malla) => ({ malla, posiciones: deformar(malla, valores, escala) }));
  const sinAjustar = partes.map((p) => p.posiciones.slice());
  const ajustada =
    calibrada.parte === 'arriba'
      ? ajustarArriba(
          partes.map((p) => p.posiciones),
          calibrada,
          cuerpo,
          talla,
          { prenda: mallas.map((m) => m.base), cuerpo: modelo.cuerpo.base, indices: mallas.map((m) => m.indices) },
          posicionesDelCuerpo,
        )
      : { ...ajustarAbajo(partes.map((p) => p.posiciones), calibrada, cuerpo, talla, mallas.map((m) => m.indices)), tronco: undefined };
  const posiciones = partes.map((p) => p.posiciones);
  // Lo que quede dentro del cuerpo (un abdomen o un brazo más grueso que la tela) sale a la piel.
  if (posicionesDelCuerpo) {
    sacarDelCuerpo(posiciones, posicionesDelCuerpo, modelo.cuerpo.indices);
    if (calibrada.parte === 'arriba') {
      partes.forEach(({ malla, posiciones: p }, i) => alisarCambio(malla, sinAjustar[i]!, p));
      sacarDelCuerpo(posiciones, posicionesDelCuerpo, modelo.cuerpo.indices);
    }
  }
  if (ajustada.tronco && debajo.length) sobreLaCapa(posiciones, debajo, ajustada.tronco);
  // Lo que cubre se mide con la tela ya en su lugar.
  ajustada.medir();

  const grupo = new THREE.Group();
  for (const { malla, posiciones } of partes) {
    const secundaria = malla.material?.name.startsWith('Secundaria');
    const color = new THREE.Color(secundaria ? '#e9e4da' : talla.color);
    grupo.add(new THREE.Mesh(geometria(malla, posiciones), materialPrenda(talla.tipo, malla, color)));
  }
  quitarLoTapado(grupo, partes.map((p) => Boolean(p.malla.material?.name.startsWith('Secundaria'))));
  return { grupo, cobertura: { ocultos: calibrada.ocultos, cubre: ajustada.cubre } };
}

/**
 * Deja de dibujar lo que la parte principal de una prenda tapa de la secundaria: de la camisa bajo
 * una chaqueta solo se ve lo que queda en la abertura, y al borde de ella la camisa pasa por debajo.
 * Las dos capas se ajustan al cuerpo por separado, y en un cuerpo de mucho peso se cruzaban.
 */
function quitarLoTapado(grupo: THREE.Group, secundarias: boolean[]): void {
  if (!secundarias.some(Boolean) || secundarias.every(Boolean)) return;
  const mallas = grupo.children as THREE.Mesh[];
  let abajo = Infinity;
  let arriba = -Infinity;
  let sumaZ = 0;
  let cuenta = 0;
  for (const malla of mallas) {
    const p = malla.geometry.getAttribute('position').array;
    for (let i = 0; i < p.length; i += 3) {
      abajo = Math.min(abajo, p[i + 1]!);
      arriba = Math.max(arriba, p[i + 1]!);
      sumaZ += p[i + 2]!;
      cuenta++;
    }
  }
  const centroZ = sumaZ / (cuenta || 1);
  const franjas = Math.ceil((arriba - abajo) / FRANJA_CAPA) + 1;
  const celda = (x: number, y: number, z: number) => {
    const s = Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * SECTORES_CAPA) % SECTORES_CAPA;
    return Math.floor((y - abajo) / FRANJA_CAPA) * SECTORES_CAPA + s;
  };
  const tapado = new Uint8Array(franjas * SECTORES_CAPA);
  // Lo más adentro que llega la parte principal en cada celda.
  const radioTapa = new Float32Array(franjas * SECTORES_CAPA).fill(Infinity);
  const marcar = (x: number, y: number, z: number) => {
    const c = celda(x, y, z);
    tapado[c] = 1;
    radioTapa[c] = Math.min(radioTapa[c]!, Math.hypot(x, z - centroZ));
  };
  mallas.forEach((malla, parte) => {
    if (secundarias[parte]) return;
    const p = malla.geometry.getAttribute('position').array;
    const indices = malla.geometry.getIndex()?.array ?? [];
    for (let t = 0; t < indices.length; t += 3) recorrerTriangulo(p, indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3, marcar);
  });
  const radioCerca = (c: number) => {
    const f = Math.floor(c / SECTORES_CAPA);
    const s = c - f * SECTORES_CAPA;
    let radio = Infinity;
    for (let df = -1; df <= 1; df++) {
      if (f + df < 0 || f + df >= franjas) continue;
      for (let ds = -1; ds <= 1; ds++) radio = Math.min(radio, radioTapa[(f + df) * SECTORES_CAPA + ((s + ds + SECTORES_CAPA) % SECTORES_CAPA)]!);
    }
    return radio;
  };
  // Solo cuenta lo tapado también alrededor: al borde de la abertura la camisa sigue debajo.
  const rodeado = (c: number) => {
    const f = Math.floor(c / SECTORES_CAPA);
    const s = c - f * SECTORES_CAPA;
    for (let df = -1; df <= 1; df++) {
      for (let ds = -2; ds <= 2; ds++) {
        if (f + df < 0 || f + df >= franjas || !tapado[(f + df) * SECTORES_CAPA + ((s + ds + SECTORES_CAPA) % SECTORES_CAPA)]) return false;
      }
    }
    return true;
  };
  mallas.forEach((malla, parte) => {
    if (!secundarias[parte]) return;
    const g = malla.geometry;
    const indices = g.getIndex();
    if (!indices) return;
    const p = g.getAttribute('position');
    const oculto = (v: number) => rodeado(celda(p.getX(v), p.getY(v), p.getZ(v)));
    const visibles: number[] = [];
    for (let t = 0; t < indices.count; t += 3) {
      const a = indices.getX(t);
      const b = indices.getX(t + 1);
      const c = indices.getX(t + 2);
      if (!(oculto(a) && oculto(b) && oculto(c))) visibles.push(a, b, c);
    }
    g.setIndex(visibles);
    const puntos = p.array as Float32Array;
    for (let i = 0; i < puntos.length; i += 3) {
      const radio = radioCerca(celda(puntos[i]!, puntos[i + 1]!, puntos[i + 2]!));
      const propio = Math.hypot(puntos[i]!, puntos[i + 2]! - centroZ);
      if (!Number.isFinite(radio) || propio <= radio - SEPARACION_BAJO_TAPA) continue;
      const k = Math.max(radio - SEPARACION_BAJO_TAPA, 0) / propio;
      puntos[i] = puntos[i]! * k;
      puntos[i + 2] = centroZ + (puntos[i + 2]! - centroZ) * k;
    }
    g.computeVertexNormals();
    unirCosturas(g, puntos);
  });
}

/** Cuánto bajo la parte principal pasa la secundaria, en metros. */
const SEPARACION_BAJO_TAPA = 0.004;

/** Recorre la superficie de un triángulo con puntos a no más de `PASO_CAPA` entre sí. */
function recorrerTriangulo(p: ArrayLike<number>, a: number, b: number, c: number, accion: (x: number, y: number, z: number) => void): void {
  const lado = Math.max(
    Math.hypot(p[a]! - p[b]!, p[a + 1]! - p[b + 1]!, p[a + 2]! - p[b + 2]!),
    Math.hypot(p[b]! - p[c]!, p[b + 1]! - p[c + 1]!, p[b + 2]! - p[c + 2]!),
    Math.hypot(p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!),
  );
  const n = Math.max(Math.ceil(lado / PASO_CAPA), 1);
  for (let u = 0; u <= n; u++) {
    for (let v = 0; v <= n - u; v++) {
      const wa = u / n;
      const wb = v / n;
      const wc = 1 - wa - wb;
      accion(p[a]! * wa + p[b]! * wb + p[c]! * wc, p[a + 1]! * wa + p[b + 1]! * wb + p[c + 1]! * wc, p[a + 2]! * wa + p[b + 2]! * wb + p[c + 2]! * wc);
    }
  }
}

/** Vecinos de cada punto de una malla, con los vértices duplicados en las costuras unidos en uno. */
interface VecinosMalla {
  punto: Int32Array;
  puntos: number;
  inicio: Int32Array;
  lista: Int32Array;
}
const vecinosPorMalla = new WeakMap<MallaDeformable, VecinosMalla>();

function vecinosDe(malla: MallaDeformable): VecinosMalla {
  const guardados = vecinosPorMalla.get(malla);
  if (guardados) return guardados;
  const base = malla.base;
  const punto = new Int32Array(base.length / 3);
  const porClave = new Map<string, number>();
  for (let i = 0; i < base.length; i += 3) {
    const clave = `${Math.round(base[i]! * 5000)},${Math.round(base[i + 1]! * 5000)},${Math.round(base[i + 2]! * 5000)}`;
    let n = porClave.get(clave);
    if (n === undefined) porClave.set(clave, (n = porClave.size));
    punto[i / 3] = n;
  }
  const puntos = porClave.size;
  const conjuntos = Array.from({ length: puntos }, () => new Set<number>());
  const indices = malla.indices;
  if (indices) {
    for (let t = 0; t < indices.count; t += 3) {
      const a = punto[indices.getX(t)]!;
      const b = punto[indices.getX(t + 1)]!;
      const c = punto[indices.getX(t + 2)]!;
      conjuntos[a]!.add(b).add(c);
      conjuntos[b]!.add(a).add(c);
      conjuntos[c]!.add(a).add(b);
    }
  }
  const inicio = new Int32Array(puntos + 1);
  conjuntos.forEach((s, i) => (inicio[i + 1] = inicio[i]! + s.size));
  const lista = new Int32Array(inicio[puntos]!);
  conjuntos.forEach((s, i) => lista.set([...s], inicio[i]!));
  const vecinos = { punto, puntos, inicio, lista };
  vecinosPorMalla.set(malla, vecinos);
  return vecinos;
}

/** Cuántas pasadas y con qué fuerza se alisa el ajuste de la tela. */
const PASADAS_ALISADO = 14;
const FUERZA_ALISADO = 0.6;

/**
 * Alisa el ajuste de la tela sobre su propia malla. Cada punto se corrige por separado al apoyarlo
 * en el cuerpo, y eso dejaba abollones, ruedos dentados y puños sueltos en los cuerpos robustos.
 * Se alisa el desplazamiento y no la forma: cuellos, dobladillos y costuras se conservan.
 */
function alisarCambio(malla: MallaDeformable, antes: Float32Array, despues: Float32Array): void {
  const { punto, puntos, inicio, lista } = vecinosDe(malla);
  let cambio = new Float32Array(puntos * 3);
  for (let v = 0; v < punto.length; v++) {
    for (let k = 0; k < 3; k++) cambio[punto[v]! * 3 + k] = despues[v * 3 + k]! - antes[v * 3 + k]!;
  }
  let siguiente = new Float32Array(puntos * 3);
  for (let pasada = 0; pasada < PASADAS_ALISADO; pasada++) {
    for (let n = 0; n < puntos; n++) {
      const desde = inicio[n]!;
      const hasta = inicio[n + 1]!;
      for (let k = 0; k < 3; k++) {
        const propio = cambio[n * 3 + k]!;
        if (hasta === desde) {
          siguiente[n * 3 + k] = propio;
          continue;
        }
        let suma = 0;
        for (let j = desde; j < hasta; j++) suma += cambio[lista[j]! * 3 + k]!;
        siguiente[n * 3 + k] = propio + FUERZA_ALISADO * (suma / (hasta - desde) - propio);
      }
    }
    [cambio, siguiente] = [siguiente, cambio];
  }
  for (let v = 0; v < punto.length; v++) {
    for (let k = 0; k < 3; k++) despues[v * 3 + k] = antes[v * 3 + k]! + cambio[punto[v]! * 3 + k]!;
  }
}

/** Separación mínima entre la tela y la piel al sacarla del cuerpo, en metros. */
const SEPARACION_COLISION = 0.006;
/** Separación entre una prenda y la que lleva debajo, en metros. */
const SEPARACION_CAPAS = 0.006;
/** Lado de cada celda de la grilla con que se buscan los vértices del cuerpo, en metros. */
const CELDA = 0.03;
/** Cuántas celdas a la redonda se busca la piel más cercana, como máximo. */
const ALCANCE_MAXIMO = 5;

/**
 * Colisión de la tela con el cuerpo: cada punto de la prenda que esté dentro del cuerpo (o a menos
 * de `SEPARACION_COLISION` de la piel) se lleva afuera, a lo largo de la normal de la piel más
 * cercana. Así ningún trozo de piel atraviesa la tela, sea cual sea la talla o el cuerpo.
 */
function sacarDelCuerpo(
  posiciones: Float32Array[],
  cuerpo: Float32Array,
  indices: THREE.BufferAttribute | null,
): void {
  const malla = new THREE.BufferGeometry();
  malla.setAttribute('position', new THREE.BufferAttribute(cuerpo, 3));
  if (indices) malla.setIndex(indices);
  malla.computeVertexNormals();
  const normales = malla.getAttribute('normal').array as Float32Array;

  const grilla = new Map<string, number[]>();
  const clave = (x: number, y: number, z: number) => `${Math.floor(x / CELDA)},${Math.floor(y / CELDA)},${Math.floor(z / CELDA)}`;
  for (let i = 0; i < cuerpo.length; i += 3) {
    const k = clave(cuerpo[i]!, cuerpo[i + 1]!, cuerpo[i + 2]!);
    const lista = grilla.get(k);
    if (lista) lista.push(i);
    else grilla.set(k, [i]);
  }

  const separacion = SEPARACION_COLISION;
  cadaVertice(posiciones, (p, i) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    const z = p[i + 2]!;
    const cx = Math.floor(x / CELDA);
    const cy = Math.floor(y / CELDA);
    const cz = Math.floor(z / CELDA);
    let cercano = -1;
    let distancia = Infinity;
    // Primero las celdas vecinas; si no hay piel cerca (la tela quedó muy adentro de un abdomen
    // grande), se busca más lejos.
    for (let alcance = 1; cercano < 0 && alcance <= ALCANCE_MAXIMO; alcance++) {
      for (let dx = -alcance; dx <= alcance; dx++) {
        for (let dy = -alcance; dy <= alcance; dy++) {
          for (let dz = -alcance; dz <= alcance; dz++) {
            // Las celdas ya revisadas con un alcance menor se saltan.
            if (alcance > 1 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < alcance) continue;
            for (const j of grilla.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
              const d = (cuerpo[j]! - x) ** 2 + (cuerpo[j + 1]! - y) ** 2 + (cuerpo[j + 2]! - z) ** 2;
              if (d < distancia) {
                distancia = d;
                cercano = j;
              }
            }
          }
        }
      }
    }
    if (cercano < 0) return;
    const nx = normales[cercano]!;
    const ny = normales[cercano + 1]!;
    const nz = normales[cercano + 2]!;
    // Altura sobre la piel, medida a lo largo de su normal.
    const sobre = (x - cuerpo[cercano]!) * nx + (y - cuerpo[cercano + 1]!) * ny + (z - cuerpo[cercano + 2]!) * nz;
    if (sobre >= separacion) return;
    // Curva creciente entre media separación y la separación completa: lo que estaba más adentro
    // sigue más adentro, así las dos capas del dobladillo no se cruzan ni se superponen.
    const nuevo = separacion * (0.5 + 0.5 * Math.exp((sobre - separacion) / separacion));
    const empuje = nuevo - sobre;
    p[i] = x + nx * empuje;
    p[i + 1] = y + ny * empuje;
    p[i + 2] = z + nz * empuje;
  });
  malla.dispose();
}

/** Alto de cada franja y cantidad de direcciones con que se mide la prenda de abajo. */
const FRANJA_CAPA = 0.02;
const SECTORES_CAPA = 72;
/** Distancia máxima entre los puntos con que se recorre cada triángulo de la prenda de abajo, en metros. */
const PASO_CAPA = 0.012;
/** Cuánto se atenúa el corrimiento por cada franja que se aleja de la zona que lo necesita, en metros. */
const ATENUACION_CAPA = 0.006;

/**
 * Lleva la tela de una prenda de arriba por fuera de la que va debajo. Se mide el contorno de la
 * prenda de abajo recorriendo la superficie de sus triángulos, no solo sus vértices: en un cuerpo
 * de mucho peso la malla se estira y entre vértice y vértice el pantalón atravesaba la tela.
 * El corrimiento se suaviza y se aplica igual a toda la tela de una zona, así no deja bultos ni
 * cruza las capas del dobladillo.
 */
function sobreLaCapa(posiciones: Float32Array[], debajo: THREE.Group[], tronco: Float32Array[]): void {
  let bastaArriba = Infinity;
  cadaVertice(posiciones, (p, i, parte) => {
    if (tronco[parte]![i / 3]! > 0) bastaArriba = Math.min(bastaArriba, p[i + 1]!);
  });
  const mallas: { p: ArrayLike<number>; indices: ArrayLike<number> }[] = [];
  let tope = -Infinity;
  let sumaZ = 0;
  let cuentaZ = 0;
  for (const grupo of debajo) {
    grupo.traverse((hijo) => {
      if (!(hijo instanceof THREE.Mesh)) return;
      const g = hijo.geometry as THREE.BufferGeometry;
      const p = g.getAttribute('position').array;
      const indices = g.getIndex()?.array;
      if (!indices) return;
      mallas.push({ p, indices });
      for (let i = 0; i < p.length; i += 3) {
        if (p[i + 1]! < bastaArriba) continue;
        tope = Math.max(tope, p[i + 1]!);
        sumaZ += p[i + 2]!;
        cuentaZ++;
      }
    });
  }
  if (!cuentaZ) return;
  const centroZ = sumaZ / cuentaZ;
  const base = Math.floor(bastaArriba / FRANJA_CAPA) - 1;
  const franjas = Math.floor(tope / FRANJA_CAPA) - base + 8;
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * SECTORES_CAPA) % SECTORES_CAPA;
  const celda = (f: number, s: number) => f * SECTORES_CAPA + ((s + SECTORES_CAPA) % SECTORES_CAPA);

  const contorno = new Float32Array(franjas * SECTORES_CAPA);
  const marcar = (x: number, y: number, z: number) => {
    const f = Math.floor(y / FRANJA_CAPA) - base;
    if (f < 0 || f >= franjas) return;
    const c = celda(f, sector(x, z));
    contorno[c] = Math.max(contorno[c]!, Math.hypot(x, z - centroZ));
  };
  for (const { p, indices } of mallas) {
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]! * 3;
      const b = indices[t + 1]! * 3;
      const c = indices[t + 2]! * 3;
      if (Math.max(p[a + 1]!, p[b + 1]!, p[c + 1]!) < bastaArriba) continue;
      recorrerTriangulo(p, a, b, c, marcar);
    }
  }

  // Cuánto le falta a la tela para quedar por fuera, en cada zona.
  let necesario = new Float32Array(franjas * SECTORES_CAPA);
  cadaVertice(posiciones, (p, i, parte) => {
    if (tronco[parte]![i / 3]! === 0) return;
    const f = Math.floor(p[i + 1]! / FRANJA_CAPA) - base;
    if (f < 0 || f >= franjas) return;
    const c = celda(f, sector(p[i]!, p[i + 2]!));
    if (!contorno[c]) return;
    necesario[c] = Math.max(necesario[c]!, contorno[c]! + SEPARACION_CAPAS - Math.hypot(p[i]!, p[i + 2]! - centroZ));
  });
  // Se extiende a las zonas vecinas (la tela tiene menos puntos que la grilla) y se suaviza.
  const vecinas = (origen: Float32Array, combinar: (valores: number[]) => number, radioF: number, radioS: number) => {
    const destino = new Float32Array(origen.length);
    for (let f = 0; f < franjas; f++) {
      for (let s = 0; s < SECTORES_CAPA; s++) {
        const valores: number[] = [];
        for (let df = -radioF; df <= radioF; df++) {
          if (f + df < 0 || f + df >= franjas) continue;
          for (let ds = -radioS; ds <= radioS; ds++) valores.push(origen[celda(f + df, s + ds)]!);
        }
        destino[celda(f, s)] = combinar(valores);
      }
    }
    return destino;
  };
  necesario = vecinas(necesario, (v) => Math.max(...v), 2, 4);
  for (let f = 1; f < franjas; f++) {
    for (let s = 0; s < SECTORES_CAPA; s++) necesario[celda(f, s)] = Math.max(necesario[celda(f, s)]!, necesario[celda(f - 1, s)]! - ATENUACION_CAPA);
  }
  for (let f = franjas - 2; f >= 0; f--) {
    for (let s = 0; s < SECTORES_CAPA; s++) necesario[celda(f, s)] = Math.max(necesario[celda(f, s)]!, necesario[celda(f + 1, s)]! - ATENUACION_CAPA);
  }
  const promedio = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  necesario = vecinas(vecinas(necesario, promedio, 1, 1), promedio, 1, 1);

  cadaVertice(posiciones, (p, i, parte) => {
    const peso = tronco[parte]![i / 3]!;
    if (peso === 0) return;
    const f = Math.floor(p[i + 1]! / FRANJA_CAPA) - base;
    if (f < 0 || f >= franjas) return;
    const r = Math.hypot(p[i]!, p[i + 2]! - centroZ);
    if (r === 0) return;
    const k = 1 + (necesario[celda(f, sector(p[i]!, p[i + 2]!))]! / r) * peso;
    p[i] = p[i]! * k;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * k;
  });
}

/** Recorre los vértices de todas las partes de una prenda. */
function cadaVertice(posiciones: Float32Array[], accion: (p: Float32Array, i: number, parte: number) => void): void {
  posiciones.forEach((p, parte) => {
    for (let i = 0; i < p.length; i += 3) accion(p, i, parte);
  });
}

/**
 * Prendas de arriba: el tronco se ensancha o se angosta alrededor del cuerpo según la holgura de
 * la talla comparada con la del modelo, y la basta baja o sube según su largo. Hombros, cuello y
 * mangas no cambian. Devuelve qué piel cubre: la que queda sobre la basta en cada dirección.
 */
function ajustarArriba(
  posiciones: Float32Array[],
  calibrada: PrendaCalibrada,
  cuerpo: MedidasCuerpo,
  talla: TallaPrenda,
  /** La prenda y el cuerpo sin deformar, y los triángulos de la prenda. */
  base: { prenda: Float32Array[]; cuerpo: Float32Array; indices: (THREE.BufferAttribute | null)[] },
  posicionesDelCuerpo?: Float32Array,
): { cubre: (x: number, y: number, z: number) => boolean; tronco: Float32Array[]; medir: () => void } {
  const { ajuste } = calibrada;
  const { abajo, arriba, pecho, axila } = alturasDelTronco(posiciones, ajuste);

  // Nunca queda a menos de 2 cm de holgura del pecho.
  const holguraTalla = Math.max(talla.contorno - cuerpo.pecho, 2);
  const factor = (cuerpo.pecho + holguraTalla) / (cuerpo.pecho + Math.max(ajuste.holgura, 2));
  const centroZ = centroDelTronco(posiciones, pecho);
  // Qué es tronco y qué es manga se decide en el modelo sin deformar (ver `separarTronco`).
  const { tronco, brazos } = separarTronco(base.prenda, base.cuerpo, ajuste);
  cadaVertice(posiciones, (p, i, parte) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    // Pleno bajo el pecho, se desvanece hacia la axila y hacia los costados (donde nacen las mangas).
    const vertical = Math.min(Math.max((axila - y) / (axila - pecho), 0), 1);
    const lateral = tronco[parte]![i / 3]!;
    const s = 1 + (factor - 1) * vertical * lateral;
    p[i] = x * s;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * s;
  });

  // Largo: la prenda puesta mide, del hombro a la basta, el largo de la talla (medido en plano)
  // por lo que cae al usarla. Bajo el pecho, cada vértice del tronco baja (o sube) en proporción a
  // su distancia del pecho; las mangas no se mueven.
  const pesoTronco = (i: number, parte: number) => tronco[parte]![i / 3]!;
  let bastaActual = Infinity;
  cadaVertice(posiciones, (p, i, parte) => {
    if (pesoTronco(i, parte) === 1) bastaActual = Math.min(bastaActual, p[i + 1]!);
  });
  if (!Number.isFinite(bastaActual)) bastaActual = abajo;
  const alargue = (talla.largo * CAIDA_PUESTA) / 100 - (arriba - bastaActual);
  cadaVertice(posiciones, (p, i, parte) => {
    const y = p[i + 1]!;
    if (y < pecho) p[i + 1] = y - alargue * Math.min((pecho - y) / (pecho - bastaActual), 1) * pesoTronco(i, parte);
  });

  // Una talla chica no alcanza a rodear el abdomen: la tela se sube hasta donde el cuerpo todavía
  // cabe en ella (estirándose un poco) y deja ver la piel de más abajo. Si el que no cabe es el
  // pecho, la tela estirada a lo ancho se acorta. Por ahora solo en la polera que se prueba.
  if (posicionesDelCuerpo && talla.seSube) {
    const tope = alturaQueNoCabe(posicionesDelCuerpo, pecho, centroZ, brazos, (talla.contorno / 100) * ESTIRAMIENTO);
    const basta = bastaActual - alargue;
    const porAbdomen = tope > basta ? (pecho - tope) / (pecho - basta) : 1;
    const porPecho = 1 - (Math.max(cuerpo.pecho - talla.contorno, 0) / talla.contorno) * ACORTE_POR_ESTIRAMIENTO;
    // La tela no se recoge más que hasta la mitad del tronco.
    const k = Math.max(Math.min(porAbdomen, porPecho), COBERTURA_MINIMA);
    if (k < 1) {
      cadaVertice(posiciones, (p, i, parte) => {
        const y = p[i + 1]!;
        if (y < pecho) p[i + 1] = y + (pecho - (pecho - y) * k - y) * pesoTronco(i, parte);
      });
    }
  }

  const sectores = 48;
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * sectores) % sectores;
  // La chaqueta es estructurada y lleva una camisa debajo: no cae como una polera, y hacer caer
  // ambas capas las cruza.
  if (posicionesDelCuerpo && talla.tipo !== 'chaqueta') {
    dejarCaer(posiciones, posicionesDelCuerpo, { pecho, axila, centroZ, brazos, pesoTronco, sector, sectores });
  }

  // Altura de la basta en cada dirección alrededor del cuerpo: no es pareja (los costados suelen
  // quedar más altos), y la piel solo se oculta donde la prenda de verdad la cubre.
  // Se mide sobre la superficie de la tela: en un abdomen grande la malla se estira, a un sector
  // podían no tocarle vértices de la basta y la piel de esa dirección asomaba por la tela. Y se
  // mide con la tela ya en su lugar (`medir`), después de la colisión con el cuerpo, que la mueve.
  const bastaPorSector = new Float32Array(sectores);
  let bastaMasBaja = Infinity;
  const marcarBasta = (x: number, y: number, z: number) => {
    if (y > pecho) return;
    const s = sector(x, z);
    bastaPorSector[s] = Math.min(bastaPorSector[s]!, y);
  };
  const medir = () => {
    bastaPorSector.fill(Infinity);
    posiciones.forEach((p, parte) => {
      const indices = base.indices[parte]?.array ?? [];
      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t]! * 3;
        const b = indices[t + 1]! * 3;
        const c = indices[t + 2]! * 3;
        if (Math.min(p[a + 1]!, p[b + 1]!, p[c + 1]!) <= pecho) recorrerTriangulo(p, a, b, c, marcarBasta);
      }
    });
    bastaMasBaja = Math.min(...bastaPorSector);
  };
  medir();
  const cubre = (x: number, y: number, z: number) => {
    // Con los vecinos se toma la más alta: es preferible ocultar un poco menos que dejar un hueco.
    const s = sector(x, z);
    let basta = -Infinity;
    for (const d of [-1, 0, 1]) {
      const valor = bastaPorSector[(s + d + sectores) % sectores]!;
      basta = Math.max(basta, Number.isFinite(valor) ? valor : bastaMasBaja);
    }
    // Margen chico: la basta ya se mide en la tela, y con más la piel de un abdomen grande asomaba
    // rota justo sobre ella.
    return y > basta + 0.015;
  };
  return { cubre, tronco, medir };
}

/**
 * Alturas de una prenda de arriba: sus extremos, la del pecho (la de la calibración, llevada al
 * alto de la prenda) y la de la axila, donde empieza el tronco; más arriba quedan hombros, cuello
 * y mangas.
 */
function alturasDelTronco(posiciones: Float32Array[], ajuste: AjustePrenda): { abajo: number; arriba: number; pecho: number; axila: number } {
  let abajo = Infinity;
  let arriba = -Infinity;
  cadaVertice(posiciones, (p, i) => {
    abajo = Math.min(abajo, p[i + 1]!);
    arriba = Math.max(arriba, p[i + 1]!);
  });
  const pecho = abajo + ((ajuste.alturaMedida - ajuste.bordeInferior) / ajuste.largoVertical) * (arriba - abajo);
  return { abajo, arriba, pecho, axila: pecho + (arriba - pecho) * 0.3 };
}

/** Profundidad media del tronco de la prenda bajo el pecho: el centro alrededor del que se ensancha. */
function centroDelTronco(posiciones: Float32Array[], pecho: number): number {
  let suma = 0;
  let cuenta = 0;
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! < pecho) {
      suma += p[i + 2]!;
      cuenta++;
    }
  });
  return suma / (cuenta || 1);
}

/**
 * Cuánto es tronco cada vértice de la prenda (1) o manga (0), y qué vértices del cuerpo son de los
 * brazos. Se decide en el modelo sin deformar, el cuerpo promedio: ahí siempre hay espacio entre
 * el torso y el brazo. En un cuerpo de mucho peso el brazo queda pegado al torso, y los costados
 * de la prenda se confundían con mangas: quedaban a medio ensanchar, como alas.
 *
 * Cerca de la axila el límite es una línea que sigue el brazo: ahí el torso y el brazo se tocan, y
 * medir solo la distancia al centro marcaba el puño como tronco. Más abajo el límite es el medio
 * del espacio entre ambos, que además deja fuera el antebrazo y la mano.
 */
function separarTronco(prenda: Float32Array[], cuerpo: Float32Array, ajuste: AjustePrenda): { tronco: Float32Array[]; brazos: Uint8Array } {
  const { axila } = alturasDelTronco(prenda, ajuste);
  const { sobreElBrazo, espacio } = lineaDelBrazo(cuerpo, axila);
  const tronco = prenda.map((p) => {
    const pesos = new Float32Array(p.length / 3);
    for (let i = 0; i < p.length; i += 3) {
      const x = Math.abs(p[i]!);
      const y = p[i + 1]!;
      const limite = espacio(y);
      const pesoLinea = 0.5 - (sobreElBrazo(x, y) + HOLGURA_MANGA) / TRANSICION_MANGA;
      const pesoEspacio = limite === null ? 1 : 0.5 + (limite - x) / TRANSICION_MANGA;
      pesos[i / 3] = Math.min(Math.max(Math.min(pesoLinea, pesoEspacio), 0), 1);
    }
    return pesos;
  });
  const brazos = new Uint8Array(cuerpo.length / 3);
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = Math.abs(cuerpo[i]!);
    const y = cuerpo[i + 1]!;
    const limite = y < axila ? espacio(y) : null;
    brazos[i / 3] = sobreElBrazo(x, y) > 0 || (limite !== null && x > limite) ? 1 : 0;
  }
  return { tronco, brazos };
}

/** Cuánto se estira el tejido de una polera alrededor del cuerpo antes de subirse. */
const ESTIRAMIENTO = 1.06;
/** Cuánto se acorta el tronco por cada parte en que el pecho supera a la prenda (10 % más de pecho: 20 % más corta). */
const ACORTE_POR_ESTIRAMIENTO = 2;
/** Parte del tronco bajo el pecho que sigue cubriendo una polera chica, como mínimo. */
const COBERTURA_MINIMA = 0.5;

/**
 * Altura más alta bajo el pecho en que el contorno del tronco supera `contornoMaximo` (en metros),
 * o `-Infinity` si cabe entero. El contorno de cada franja se mide alrededor del centro, con el
 * radio más afuera en cada dirección, sin contar los vértices de los brazos (marcados en `brazos`).
 */
function alturaQueNoCabe(cuerpo: Float32Array, pecho: number, centroZ: number, brazos: Uint8Array, contornoMaximo: number): number {
  const sectores = 48;
  const franjas = new Map<number, Float32Array>();
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = cuerpo[i]!;
    const y = cuerpo[i + 1]!;
    if (y > pecho || brazos[i / 3]) continue;
    const z = cuerpo[i + 2]! - centroZ;
    const f = Math.floor(y / FRANJA);
    let fila = franjas.get(f);
    if (!fila) franjas.set(f, (fila = new Float32Array(sectores)));
    const s = Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * sectores) % sectores;
    fila[s] = Math.max(fila[s]!, Math.hypot(x, z));
  }
  const desdeArriba = [...franjas.keys()].sort((a, b) => b - a);
  for (const f of desdeArriba) {
    const fila = franjas.get(f)!;
    // Las direcciones sin vértices toman el radio de la vecina; si la franja tiene pocas, no se mide.
    if (fila.filter((r) => r > 0).length < sectores / 2) continue;
    let contorno = 0;
    for (let s = 0; s < sectores; s++) {
      const r = fila[s] || Math.max(fila[(s + 1) % sectores]!, fila[(s - 1 + sectores) % sectores]!);
      contorno += (r * 2 * Math.PI) / sectores;
    }
    if (contorno > contornoMaximo) return (f + 1) * FRANJA;
  }
  return -Infinity;
}

/** Separación mínima entre la tela y la piel, en metros. */
const SEPARACION_TELA = 0.008;
/**
 * Cuánto más allá de su caída puede apoyarse la tela sobre el cuerpo, en metros: lo que sobresale
 * un abdomen grande. Los brazos no cuentan (ver `separarTronco`).
 */
const APOYO_MAXIMO = 0.2;
/** Alto de cada franja con que se mide el cuerpo, en metros. */
const FRANJA = 0.02;

/** Espacio mínimo entre el torso y el brazo para distinguirlos, en metros. */
const ESPACIO_BRAZO = 0.025;
/** Medio ancho mínimo del torso: un espacio más cerca del centro es entre vértices del propio torso. */
const MEDIO_TORSO_MINIMO = 0.08;
/** Alto de cada franja con que se busca el espacio entre torso y brazo: más que la distancia entre anillos de la malla. */
const FRANJA_BRAZO = 0.04;
/** Ancho de la transición entre tronco y manga en el límite, en metros. */
const TRANSICION_MANGA = 0.01;
/** Cuánto cuelga la manga bajo la línea del brazo, en metros. */
const HOLGURA_MANGA = 0.015;

/**
 * Lo que separa el brazo del torso: `sobreElBrazo` es la distancia con signo a la línea que va del
 * punto más alto del espacio entre ambos a la punta de la mano (positiva sobre el brazo), y
 * `espacio` la mitad de ese espacio a cada altura, `null` donde no lo hay (cerca de la axila).
 *
 * Se usa con el cuerpo promedio (ver `separarTronco`): en un abdomen grande la malla se estira y
 * sus vértices quedan más separados que el espacio buscado.
 */
function lineaDelBrazo(cuerpo: Float32Array, axila: number): { sobreElBrazo: (x: number, y: number) => number; espacio: (y: number) => number | null } {
  const porFranja = new Map<number, number[]>();
  let manoX = 0;
  let manoY = 0;
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = Math.abs(cuerpo[i]!);
    const y = cuerpo[i + 1]!;
    if (x > manoX) {
      manoX = x;
      manoY = y;
    }
    if (y > axila) continue;
    const f = Math.floor(y / FRANJA_BRAZO);
    let lista = porFranja.get(f);
    if (!lista) porFranja.set(f, (lista = []));
    lista.push(x);
  }
  const limites = new Map<number, number>();
  let inicioX = 0;
  let inicioY = -Infinity;
  for (const [f, lista] of porFranja) {
    lista.sort((a, b) => a - b);
    for (let k = 1; k < lista.length; k++) {
      if (lista[k - 1]! >= MEDIO_TORSO_MINIMO && lista[k]! - lista[k - 1]! > ESPACIO_BRAZO) {
        const limite = (lista[k]! + lista[k - 1]!) / 2;
        limites.set(f, limite);
        if ((f + 0.5) * FRANJA_BRAZO > inicioY) {
          inicioX = limite;
          inicioY = (f + 0.5) * FRANJA_BRAZO;
        }
        break;
      }
    }
  }
  const largo = Math.hypot(manoX - inicioX, manoY - inicioY);
  const nx = (inicioY - manoY) / largo;
  const ny = (manoX - inicioX) / largo;
  return {
    sobreElBrazo: (x, y) => {
      const ax = Math.abs(x);
      const d = (ax - inicioX) * nx + (y - inicioY) * ny;
      // Hacia el centro del cuerpo no hay brazo, aunque quede sobre la línea.
      return ax < inicioX ? Math.min(d, ax - inicioX) : d;
    },
    // Con las franjas vecinas, el límite más afuera: así no hay saltos entre una altura y otra.
    espacio: (y) => {
      const f = Math.floor(y / FRANJA_BRAZO);
      let limite: number | null = null;
      for (const df of [-1, 0, 1]) {
        const valor = limites.get(f + df);
        if (valor !== undefined) limite = Math.max(limite ?? 0, valor);
      }
      return limite;
    },
  };
}

/**
 * Caída de la tela: bajo el pecho, una prenda de arriba cuelga recta desde lo más saliente del
 * tronco (el pecho adelante, los omóplatos atrás) en vez de abrirse hacia afuera, y nunca entra
 * en el cuerpo: si la cadera o el abdomen sobresalen, la tela se apoya sobre ellos.
 */
function dejarCaer(
  posiciones: Float32Array[],
  cuerpo: Float32Array,
  zona: {
    pecho: number;
    axila: number;
    centroZ: number;
    brazos: Uint8Array;
    pesoTronco: (i: number, parte: number) => number;
    sector: (x: number, z: number) => number;
    sectores: number;
  },
): void {
  const { pecho, axila, centroZ, brazos, pesoTronco, sector, sectores } = zona;
  const radio = (x: number, z: number) => Math.hypot(x, z - centroZ);

  // Hasta dónde llega la tela en cada dirección entre el pecho y la axila: desde ahí cuelga.
  // Adelante y atrás se mide hasta la axila (el pecho y los omóplatos); en los costados solo a la
  // altura del pecho, porque más arriba ya está la parte de abajo de la manga.
  const colgado = new Float32Array(sectores);
  cadaVertice(posiciones, (p, i, parte) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    const r = radio(x, p[i + 2]!);
    const costado = r > 0 && Math.abs(x) / r > 0.7;
    const tope = costado ? pecho + (axila - pecho) * 0.2 : axila;
    if (y < pecho || y > tope || pesoTronco(i, parte) < 1) return;
    const s = sector(x, p[i + 2]!);
    colgado[s] = Math.max(colgado[s]!, r);
  });

  // El contorno del tronco del cuerpo por franjas de altura bajo el pecho, en cada dirección.
  const franjas = new Map<number, Float32Array>();
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = cuerpo[i]!;
    const y = cuerpo[i + 1]!;
    if (y > pecho || brazos[i / 3]) continue;
    const f = Math.floor(y / FRANJA);
    let fila = franjas.get(f);
    if (!fila) franjas.set(f, (fila = new Float32Array(sectores)));
    const s = sector(x, cuerpo[i + 2]!);
    fila[s] = Math.max(fila[s]!, radio(x, cuerpo[i + 2]!));
  }
  const piel = (y: number, s: number) => {
    let r = 0;
    for (const df of [-1, 0, 1]) {
      const fila = franjas.get(Math.floor(y / FRANJA) + df);
      if (!fila) continue;
      for (const ds of [-1, 0, 1]) r = Math.max(r, fila[(s + ds + sectores) % sectores]!);
    }
    return r;
  };

  // La tela puede tener dos capas (el dobladillo vuelto hacia adentro): en cada franja de altura y
  // dirección todos sus puntos se mueven lo mismo, así las capas no se cruzan. La capa de afuera
  // no pasa de la caída; la de adentro se apoya sobre lo que sobresale bajo el pecho (glúteos,
  // cadera, abdomen).
  const limiteEn = (s: number) => {
    let limite = 0;
    for (const ds of [-1, 0, 1]) limite = Math.max(limite, colgado[(s + ds + sectores) % sectores]!);
    return limite;
  };
  const extremos = new Map<number, { afuera: number; adentro: number }>();
  const celda = (f: number, s: number) => f * sectores + s;
  cadaVertice(posiciones, (p, i, parte) => {
    const y = p[i + 1]!;
    if (y >= pecho || pesoTronco(i, parte) === 0) return;
    const r = radio(p[i]!, p[i + 2]!);
    const clave = celda(Math.floor(y / FRANJA), sector(p[i]!, p[i + 2]!));
    const e = extremos.get(clave);
    if (e) {
      e.afuera = Math.max(e.afuera, r);
      e.adentro = Math.min(e.adentro, r);
    } else {
      extremos.set(clave, { afuera: r, adentro: r });
    }
  });
  const corrimientos = new Map<number, number>();
  for (const [clave, { afuera, adentro }] of extremos) {
    const f = Math.floor(clave / sectores);
    const s = clave - f * sectores;
    const limite = limiteEn(s);
    if (limite === 0) continue;
    const exceso = Math.max(afuera - limite, 0);
    const apoyo = Math.min(piel((f + 0.5) * FRANJA, s) + SEPARACION_TELA, limite + APOYO_MAXIMO);
    const falta = Math.max(apoyo - (adentro - exceso), 0);
    corrimientos.set(clave, falta - exceso);
  }
  // Corrimiento suavizado entre franjas y direcciones vecinas: sin escalones.
  const corrimiento = (y: number, s: number) => {
    const f = y / FRANJA - 0.5;
    const f0 = Math.floor(f);
    const t = f - f0;
    let suma = 0;
    let pesos = 0;
    for (const [df, wf] of [[0, 1 - t], [1, t]] as const) {
      for (const [ds, ws] of [[-1, 0.25], [0, 0.5], [1, 0.25]] as const) {
        const valor = corrimientos.get(celda(f0 + df, (s + ds + sectores) % sectores));
        if (valor === undefined) continue;
        suma += valor * wf * ws;
        pesos += wf * ws;
      }
    }
    return pesos > 0 ? suma / pesos : 0;
  };
  cadaVertice(posiciones, (p, i, parte) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    const peso = pesoTronco(i, parte);
    if (y >= pecho || peso === 0) return;
    const z = p[i + 2]!;
    const r = radio(x, z);
    if (r === 0) return;
    const k = 1 + (corrimiento(y, sector(x, z)) / r) * peso;
    p[i] = x * k;
    p[i + 2] = centroZ + (z - centroZ) * k;
  });
}

/**
 * Pantalones: sobre la entrepierna, la pretina y la cadera se ensanchan o se angostan según la
 * holgura de la talla comparada con la del modelo. Devuelve qué piel cubre: entre los ruedos y
 * la pretina.
 */
function ajustarAbajo(
  posiciones: Float32Array[],
  calibrada: PrendaCalibrada,
  cuerpo: MedidasCuerpo,
  talla: TallaPrenda,
  indices: (THREE.BufferAttribute | null)[],
): { cubre: (x: number, y: number, z: number) => boolean; medir: () => void } {
  const { ajuste } = calibrada;
  let abajo = Infinity;
  let arriba = -Infinity;
  let centroZ = 0;
  let total = 0;
  cadaVertice(posiciones, (p, i) => {
    abajo = Math.min(abajo, p[i + 1]!);
    arriba = Math.max(arriba, p[i + 1]!);
    centroZ += p[i + 2]!;
    total++;
  });
  centroZ /= total || 1;
  const entrepierna = (cuerpo.altura / 100) * 0.47;
  const cadera = abajo + ((ajuste.alturaMedida - ajuste.bordeInferior) / ajuste.largoVertical) * (arriba - abajo);

  // La talla de pantalón se elige por la cintura: esa holgura se lleva a la cadera del modelo.
  // Se dibuja entre un mínimo y un máximo: con menos la piel atraviesa la tela y con más las
  // caderas se inflan. Lo apretado o lo holgado de la talla lo indica el texto del ajuste.
  const holguraTalla = Math.min(Math.max(talla.contorno - cuerpo.cintura, HOLGURA_PRETINA), HOLGURA_MAXIMA_DIBUJADA);
  const base = cuerpo.cadera + Math.max(ajuste.holgura, 1);
  const factor = (cuerpo.cadera + holguraTalla) / base;
  // Una pretina holgada no se queda abierta alrededor del cuerpo: cae y se ajusta con el
  // cinturón. Sobre la cadera, la holgura se va cerrando hasta quedar en no más de 4 cm.
  const factorPretina = (cuerpo.cadera + Math.min(holguraTalla, HOLGURA_PRETINA)) / base;
  cadaVertice(posiciones, (p, i) => {
    const y = p[i + 1]!;
    const peso = Math.min(Math.max((y - entrepierna) / Math.max(cadera - entrepierna, 0.01), 0), 1);
    const haciaPretina = Math.min(Math.max((y - cadera) / Math.max(arriba - cadera, 0.01), 0), 1);
    const s = 1 + (factor + (factorPretina - factor) * haciaPretina - 1) * peso;
    p[i] = p[i]! * s;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * s;
  });

  // Altura de la pretina en cada dirección alrededor del cuerpo: no es pareja (atrás suele ser
  // más alta), y la piel solo se oculta bajo ella.
  const sectores = 48;
  const pretinaPorSector = new Float32Array(sectores).fill(-Infinity);
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * sectores) % sectores;
  // Sobre la superficie de la tela: a un sector podían no tocarle vértices de la pretina, se creía
  // más baja de lo que es y por ahí la piel de la cadera asomaba como un punto en el pantalón.
  const marcarPretina = (x: number, y: number, z: number) => {
    if (y < cadera) return;
    const s = sector(x, z);
    pretinaPorSector[s] = Math.max(pretinaPorSector[s]!, y);
  };
  // Con la tela ya en su lugar, como la basta de las prendas de arriba.
  const medir = () => {
    pretinaPorSector.fill(-Infinity);
    posiciones.forEach((p, parte) => {
      const lista = indices[parte]?.array ?? [];
      for (let t = 0; t < lista.length; t += 3) {
        const a = lista[t]! * 3;
        const b = lista[t + 1]! * 3;
        const c = lista[t + 2]! * 3;
        if (Math.max(p[a + 1]!, p[b + 1]!, p[c + 1]!) >= cadera) recorrerTriangulo(p, a, b, c, marcarPretina);
      }
    });
  };
  medir();
  const cubre = (x: number, y: number, z: number) => {
    if (y < abajo + 0.04) return false;
    // Con los vecinos se toma la más baja: es preferible ocultar un poco menos que dejar un hueco.
    const s = sector(x, z);
    let pretina = Infinity;
    for (const d of [-1, 0, 1]) {
      const valor = pretinaPorSector[(s + d + sectores) % sectores]!;
      pretina = Math.min(pretina, Number.isFinite(valor) ? valor : arriba);
    }
    return y < pretina - 0.02;
  };
  return { cubre, medir };
}

/** Cuánto arriba y abajo del cinturón se mide el cuerpo, en metros. */
const ALTO_CINTURON = 0.03;

/** Vértices de los brazos del cuerpo, los mismos para cualquier medida. */
function brazosDelCuerpo(modelo: ModeloReal): Uint8Array {
  const cuerpo = modelo.cuerpo.base;
  let arriba = -Infinity;
  for (let i = 1; i < cuerpo.length; i += 3) arriba = Math.max(arriba, cuerpo[i]!);
  const { sobreElBrazo, espacio } = lineaDelBrazo(cuerpo, arriba * 0.8);
  const brazos = new Uint8Array(cuerpo.length / 3);
  for (let i = 0; i < cuerpo.length; i += 3) {
    const x = Math.abs(cuerpo[i]!);
    const y = cuerpo[i + 1]!;
    const limite = espacio(y);
    brazos[i / 3] = sobreElBrazo(x, y) > 0 || (limite !== null && x > limite) ? 1 : 0;
  }
  return brazos;
}

/** Altura media del borde de arriba de un pantalón, alrededor del cuerpo. */
function alturaDePretina(pantalon?: THREE.Group): number | null {
  if (!pantalon) return null;
  const sectores = 24;
  const bordes = new Float32Array(sectores).fill(-Infinity);
  pantalon.traverse((hijo) => {
    if (!(hijo instanceof THREE.Mesh)) return;
    const p = hijo.geometry.getAttribute('position').array;
    for (let i = 0; i < p.length; i += 3) {
      const s = Math.floor((Math.atan2(p[i]!, p[i + 2]!) / (2 * Math.PI) + 0.5) * sectores) % sectores;
      bordes[s] = Math.max(bordes[s]!, p[i + 1]!);
    }
  });
  const medidos = bordes.filter(Number.isFinite);
  return medidos.length ? medidos.reduce((a, b) => a + b, 0) / medidos.length : null;
}

/**
 * Cinturón armado sobre el cuerpo deformado: una correa que sigue el contorno de la cadera, con
 * hebilla y tachas metálicas.
 */
export function crearCinturonReal(modelo: ModeloReal, posiciones: Float32Array, cuerpo: MedidasCuerpo, color: string, pantalon?: THREE.Group): THREE.Group {
  const h = cuerpo.altura / 100;
  // A la altura de la pretina: en un cuerpo de mucho peso el pantalón queda bajo el abdomen.
  const y = Math.min(0.575 * h, alturaDePretina(pantalon) ?? Infinity);
  const ancho = 0.035;
  // Lo que es brazo se decide en el cuerpo promedio (ver `separarTronco`): con el peso, el brazo
  // queda pegado al abdomen y no se distingue por su distancia al centro.
  const brazos = brazosDelCuerpo(modelo);
  const cerca = (i: number) => Math.abs(posiciones[i + 1]! - y) < ALTO_CINTURON && !brazos[i / 3];
  // Radio del cuerpo en cada dirección a la altura del cinturón, sin manos ni brazos.
  const sectores = 64;
  const radios = new Float32Array(sectores);
  let centroZ = 0;
  let cuenta = 0;
  for (let i = 0; i < posiciones.length; i += 3) {
    if (cerca(i)) {
      centroZ += posiciones[i + 2]!;
      cuenta++;
    }
  }
  centroZ /= cuenta || 1;
  for (let i = 0; i < posiciones.length; i += 3) {
    if (!cerca(i)) continue;
    const x = posiciones[i]!;
    const z = posiciones[i + 2]! - centroZ;
    const s = Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * sectores) % sectores;
    radios[s] = Math.max(radios[s]!, Math.hypot(x, z));
  }
  // Sectores sin vértices toman el de sus vecinos, y el contorno se suaviza.
  for (let s = 0; s < sectores; s++) if (!radios[s]) radios[s] = radios[(s + 1) % sectores] || radios[(s - 1 + sectores) % sectores] || 0.15 * h;
  const suave = radios.map((_, s) => (radios[(s - 1 + sectores) % sectores]! + 2 * radios[s]! + radios[(s + 1) % sectores]!) / 4 + 0.006);

  const puntos: number[] = [];
  const indices: number[] = [];
  for (let s = 0; s <= sectores; s++) {
    const angulo = (s / sectores - 0.5) * 2 * Math.PI;
    const r = suave[s % sectores]!;
    const x = Math.sin(angulo) * r;
    const z = centroZ + Math.cos(angulo) * r;
    puntos.push(x, y - ancho / 2, z, x, y + ancho / 2, z);
    if (s < sectores) indices.push(s * 2, s * 2 + 2, s * 2 + 1, s * 2 + 1, s * 2 + 2, s * 2 + 3);
  }
  const correa = new THREE.BufferGeometry();
  correa.setAttribute('position', new THREE.Float32BufferAttribute(puntos, 3));
  correa.setIndex(indices);
  correa.computeVertexNormals();

  const grupo = new THREE.Group();
  grupo.add(new THREE.Mesh(correa, new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide })));
  const metal = new THREE.MeshStandardMaterial({ color: '#c9c9d1', metalness: 0.95, roughness: 0.25 });
  const frente = suave[Math.floor(sectores / 2)]!;
  const hebilla = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.01), metal);
  hebilla.position.set(0, y, centroZ + frente + 0.004);
  grupo.add(hebilla);
  for (let s = 0; s < sectores; s += 4) {
    if (Math.abs(s - sectores / 2) < 4) continue;
    const angulo = (s / sectores - 0.5) * 2 * Math.PI;
    const tacha = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), metal);
    tacha.position.set(Math.sin(angulo) * (suave[s]! + 0.002), y, centroZ + Math.cos(angulo) * (suave[s]! + 0.002));
    grupo.add(tacha);
  }
  return grupo;
}
