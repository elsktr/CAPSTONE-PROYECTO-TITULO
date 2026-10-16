import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { MedidasCuerpo, Sexo, TipoPrenda, medidasDeTalla } from '../data/probador';

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
type Parametro = 'altura' | 'peso' | (typeof CONTORNOS)[number];

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
  tablas: Record<Parametro, Fila[]>;
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
/** La prenda medida en plano cuelga más corta de lo que mide (igual que en `escena-maniqui.ts`). */
const CAIDA = 0.82;
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

/** Cuánto aplicar de cada parámetro (con signo) y la escala final, para un cuerpo dado. */
export function resolverCuerpo(calibracion: Calibracion, cuerpo: MedidasCuerpo): { valores: Record<Parametro, number>; escala: number } {
  const { tablas } = calibracion;
  const peso = Math.min(Math.max((cuerpo.imc - 17) / 14, 0), 1) * 2 - 1;
  const altura = invertir(tablas.altura.map((f) => ({ valor: f.valor, medida: f.altura })), cuerpo.altura);
  const escala = cuerpo.altura / interpolar(tablas.altura, 'altura', altura);
  const valores = { altura, peso } as Record<Parametro, number>;
  for (const m of CONTORNOS) {
    const base = interpolar(tablas[m], m, 0);
    const sinControl = base + (interpolar(tablas.altura, m, altura) - base) + (interpolar(tablas.peso, m, peso) - base);
    const diferencia = cuerpo[m] / escala - sinControl;
    valores[m] = invertir(tablas[m].map((f) => ({ valor: f.valor, medida: f[m] - base })), diferencia);
  }
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

function geometria(malla: MallaDeformable, posiciones: Float32Array): THREE.BufferGeometry {
  const resultado = new THREE.BufferGeometry();
  resultado.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  if (malla.uv) resultado.setAttribute('uv', malla.uv.clone());
  if (malla.indices) resultado.setIndex(malla.indices.clone());
  resultado.computeVertexNormals();
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
export function crearCuerpoReal(modelo: ModeloReal, posiciones: Float32Array, cobertura?: Cobertura): THREE.Mesh {
  const resultado = geometria(modelo.cuerpo, posiciones);
  const indices = resultado.getIndex();
  if (cobertura && indices) {
    const ocultos = new Set(cobertura.ocultos);
    const oculto = (v: number) => ocultos.has(v) && cobertura.cubre(posiciones[v * 3]!, posiciones[v * 3 + 1]!, posiciones[v * 3 + 2]!);
    const visibles: number[] = [];
    for (let t = 0; t < indices.count; t += 3) {
      const a = indices.getX(t);
      const b = indices.getX(t + 1);
      const c = indices.getX(t + 2);
      if (!(oculto(a) && oculto(b) && oculto(c))) visibles.push(a, b, c);
    }
    resultado.setIndex(visibles);
  }
  const material = new THREE.MeshPhysicalMaterial({ color: '#d8cfc4', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.6 });
  return new THREE.Mesh(resultado, material);
}

/** Medidas de la talla de la prenda, en centímetros, y su color. */
export interface TallaPrenda {
  tipo: TipoPrenda;
  /** Contorno de la prenda: pecho en las de arriba, cintura en pantalones. */
  contorno: number;
  /** Largo del cuerpo de la prenda, o largo de pierna en pantalones. */
  largo: number;
  color: string;
}

/** Material de cada tipo de prenda, con el relieve de tela del modelo y el color del producto. */
function materialPrenda(tipo: TipoPrenda, original: THREE.MeshStandardMaterial | null, color: THREE.Color): THREE.MeshPhysicalMaterial {
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
    normalMap: original?.normalMap ?? null,
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
): { grupo: THREE.Group; cobertura: Cobertura } {
  const calibrada = modelo.calibracion.prendas[talla.tipo]!;
  const { valores, escala } = resolverCuerpo(modelo.calibracion, cuerpo);
  const partes = mallas.map((malla) => ({ malla, posiciones: deformar(malla, valores, escala) }));
  const cobertura =
    calibrada.parte === 'arriba'
      ? ajustarArriba(partes.map((p) => p.posiciones), calibrada, cuerpo, talla, escala)
      : ajustarAbajo(partes.map((p) => p.posiciones), calibrada, cuerpo, talla);

  const grupo = new THREE.Group();
  for (const { malla, posiciones } of partes) {
    const secundaria = malla.material?.name.startsWith('Secundaria');
    const color = new THREE.Color(secundaria ? '#e9e4da' : talla.color);
    grupo.add(new THREE.Mesh(geometria(malla, posiciones), materialPrenda(talla.tipo, malla.material, color)));
  }
  return { grupo, cobertura: { ocultos: calibrada.ocultos, cubre: cobertura } };
}

/** Recorre los vértices de todas las partes de una prenda. */
function cadaVertice(posiciones: Float32Array[], accion: (p: Float32Array, i: number) => void): void {
  for (const p of posiciones) for (let i = 0; i < p.length; i += 3) accion(p, i);
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
  escala: number,
): (x: number, y: number, z: number) => boolean {
  const { ajuste } = calibrada;
  let abajo = Infinity;
  let arriba = -Infinity;
  cadaVertice(posiciones, (p, i) => {
    abajo = Math.min(abajo, p[i + 1]!);
    arriba = Math.max(arriba, p[i + 1]!);
  });
  const pecho = abajo + ((ajuste.alturaMedida - ajuste.bordeInferior) / ajuste.largoVertical) * (arriba - abajo);
  // Bajo la axila empieza el tronco de la prenda; arriba quedan hombros, cuello y mangas.
  const axila = pecho + (arriba - pecho) * 0.3;

  // Nunca queda a menos de 2 cm de holgura del pecho.
  const holguraTalla = Math.max(talla.contorno - cuerpo.pecho, 2);
  const factor = (cuerpo.pecho + holguraTalla) / (cuerpo.pecho + Math.max(ajuste.holgura, 2));
  const semiancho = ((cuerpo.pecho + Math.max(ajuste.holgura, 2)) / 100 / 5.47) * escala;
  let centroZ = 0;
  let enTronco = 0;
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! < pecho) {
      centroZ += p[i + 2]!;
      enTronco++;
    }
  });
  centroZ /= enTronco || 1;
  cadaVertice(posiciones, (p, i) => {
    const x = p[i]!;
    const y = p[i + 1]!;
    // Pleno bajo el pecho, se desvanece hacia la axila y hacia los costados (donde nacen las mangas).
    const vertical = Math.min(Math.max((axila - y) / (axila - pecho), 0), 1);
    const lateral = Math.min(Math.max((semiancho * 1.25 - Math.abs(x)) / (semiancho * 0.25), 0), 1);
    const s = 1 + (factor - 1) * vertical * lateral;
    p[i] = x * s;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * s;
  });

  // Largo: bajo el pecho, cada vértice baja (o sube) en proporción a su distancia del pecho. El
  // modelo corresponde a una talla M.
  const largoModelo = medidasDeTalla(talla.tipo, 'M')?.largo ?? talla.largo;
  const alargue = ((talla.largo - largoModelo) * CAIDA * escala) / 100;
  cadaVertice(posiciones, (p, i) => {
    const y = p[i + 1]!;
    if (y < pecho) p[i + 1] = y - alargue * Math.min((pecho - y) / (pecho - abajo), 1);
  });

  // Altura de la basta en cada dirección alrededor del cuerpo: no es pareja (los costados suelen
  // quedar más altos), y la piel solo se oculta donde la prenda de verdad la cubre.
  const sectores = 48;
  const bastaPorSector = new Float32Array(sectores).fill(Infinity);
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * sectores) % sectores;
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! > pecho) return;
    const s = sector(p[i]!, p[i + 2]!);
    bastaPorSector[s] = Math.min(bastaPorSector[s]!, p[i + 1]!);
  });
  const bastaMasBaja = Math.min(...bastaPorSector);
  return (x, y, z) => {
    // Con los vecinos se toma la más alta: es preferible ocultar un poco menos que dejar un hueco.
    const s = sector(x, z);
    let basta = -Infinity;
    for (const d of [-1, 0, 1]) {
      const valor = bastaPorSector[(s + d + sectores) % sectores]!;
      basta = Math.max(basta, Number.isFinite(valor) ? valor : bastaMasBaja);
    }
    // Margen: la basta puede tener un doblez hacia adentro que la hace parecer más baja.
    return y > basta + 0.04;
  };
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
): (x: number, y: number, z: number) => boolean {
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
  const holguraTalla = Math.max(talla.contorno - cuerpo.cintura, 1);
  const factor = (cuerpo.cadera + holguraTalla) / (cuerpo.cadera + Math.max(ajuste.holgura, 1));
  cadaVertice(posiciones, (p, i) => {
    const y = p[i + 1]!;
    const peso = Math.min(Math.max((y - entrepierna) / Math.max(cadera - entrepierna, 0.01), 0), 1);
    const s = 1 + (factor - 1) * peso;
    p[i] = p[i]! * s;
    p[i + 2] = centroZ + (p[i + 2]! - centroZ) * s;
  });

  // Altura de la pretina en cada dirección alrededor del cuerpo: no es pareja (atrás suele ser
  // más alta), y la piel solo se oculta bajo ella.
  const sectores = 48;
  const pretinaPorSector = new Float32Array(sectores).fill(-Infinity);
  const sector = (x: number, z: number) => Math.floor((Math.atan2(x, z - centroZ) / (2 * Math.PI) + 0.5) * sectores) % sectores;
  cadaVertice(posiciones, (p, i) => {
    if (p[i + 1]! < cadera) return;
    const s = sector(p[i]!, p[i + 2]!);
    pretinaPorSector[s] = Math.max(pretinaPorSector[s]!, p[i + 1]!);
  });
  return (x, y, z) => {
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
}

/**
 * Cinturón armado sobre el cuerpo deformado: una correa que sigue el contorno de la cadera, con
 * hebilla y tachas metálicas.
 */
export function crearCinturonReal(posiciones: Float32Array, cuerpo: MedidasCuerpo, color: string): THREE.Group {
  const h = cuerpo.altura / 100;
  const y = 0.575 * h;
  const ancho = 0.035;
  // Radio del cuerpo en cada dirección a la altura del cinturón, sin manos ni brazos.
  const sectores = 64;
  const radios = new Float32Array(sectores);
  let centroZ = 0;
  let cuenta = 0;
  for (let i = 0; i < posiciones.length; i += 3) {
    if (Math.abs(posiciones[i + 1]! - y) < 0.015 && Math.abs(posiciones[i]!) < 0.25 * h) {
      centroZ += posiciones[i + 2]!;
      cuenta++;
    }
  }
  centroZ /= cuenta || 1;
  for (let i = 0; i < posiciones.length; i += 3) {
    const x = posiciones[i]!;
    const z = posiciones[i + 2]! - centroZ;
    const r = Math.hypot(x, z);
    if (Math.abs(posiciones[i + 1]! - y) > 0.015 || r > 0.2 * h) continue;
    const s = Math.floor((Math.atan2(x, z) / (2 * Math.PI) + 0.5) * sectores) % sectores;
    radios[s] = Math.max(radios[s]!, r);
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
