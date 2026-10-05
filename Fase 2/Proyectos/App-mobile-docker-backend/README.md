# Rockstar

Plataforma de inventario y venta para una tienda de ropa: app de bodega, tienda web, backend y base de datos.

| Pieza | Carpeta | Tecnología |
|---|---|---|
| App de bodega | `apps/bodega-mobile` | Ionic Angular + Capacitor |
| Tienda web | `apps/e-commerce` | Ionic Angular (dependencias propias, fuera del espacio de trabajo de npm) |
| Backend | `services/api` | NestJS |
| Base de datos | `db/migrations` | PostgreSQL |
| Contratos de la API | `packages/contracts` | Tipos de TypeScript compartidos |

El diseño completo y el plan de trabajo están en `openspec/changes/plataforma-omnicanal-mvp/`.

## Levantar todo con Docker

Cada pieza corre en su propio contenedor.

```
docker compose up --build
```

| Contenedor | Qué es | Dirección |
|---|---|---|
| `app` | App de bodega servida por nginx | http://localhost:8080 |
| `tienda` | Tienda web servida por nginx | http://localhost:8081 |
| `api` | Backend | http://localhost:3000/api/v1 |
| `db` | PostgreSQL | `localhost:5432`, solo desde este equipo |

Al arrancar, el backend crea las tablas y, si la base está vacía, carga datos de demostración.

| Cuenta | Contraseña | Rol |
|---|---|---|
| `bodega@rockstar.cl` | `bodega123` | Bodega. Es la única que entra a la app de bodega |
| `vendedor@rockstar.cl` | `vendedor123` | Vendedor |
| `gerente@rockstar.cl` | `gerente123` | Gerente. En la tienda define el precio de los productos |
| `cliente@rockstar.cl` | `cliente123` | Cliente. Compra en la tienda; también se puede crear una cuenta nueva |

**Catálogo de bandas.** Con el sistema arriba, este comando carga las fotos de 17 bandas y 19 productos de muestra de bandas conocidas. Se puede repetir: no duplica nada.

```
cd services/api
npm run semilla:bandas
```

Las fotos de las bandas son reales, de Wikimedia Commons con licencia libre; sus autores y licencias están en `db/semillas/bandas/CREDITOS.md`. Los productos son de muestra y su imagen es una ilustración, no una foto de la prenda.

Un producto creado desde la bodega no aparece en la tienda hasta que el Gerente le pone precio: en la tienda, "Acceso administrador", pestaña Bodega, botón Editar.

Los pagos y los despachos son simulados: la tienda no cobra dinero y el código de seguimiento no existe en Starken. Ambos están detrás de adaptadores (`services/api/src/pagos/pasarela.ts` y `services/api/src/logistica/transportista.ts`) que se reemplazan al tener credenciales de Transbank y de Starken.

Otros comandos:

```
docker compose down              # detiene y conserva los datos
docker compose down --volumes    # detiene y borra la base y las claves
docker compose logs -f api       # registro del backend
```

Para cambiar contraseñas o puertos, copia `.env.example` a `.env`.

### Si Docker Desktop no arranca en Windows

Docker necesita la característica "Plataforma de máquina virtual" de Windows. Si Docker Desktop avisa que no hay virtualización, abre PowerShell **como administrador**, ejecuta lo siguiente y reinicia el equipo:

```
wsl --install
```

Si después del reinicio el aviso sigue, hay que activar la virtualización (Intel VT-x o AMD-V) en la BIOS del equipo.

## Trabajar sin Docker

Se necesita Node.js 22 o superior, y `npm install` en la raíz.

**Backend con base en memoria.** Levanta la API en http://localhost:3000 con un PostgreSQL embebido. No requiere instalar nada más, y los datos se pierden al cerrar.

```
cd services/api
npm run local
```

**Backend contra un PostgreSQL propio.**

```
cd services/api
npm run build
$env:DATABASE_URL = "postgres://usuario:clave@localhost:5432/rockstar"   # PowerShell
$env:SEMBRAR_DEMO = "true"
npm start
```

**App.** Por defecto usa un backend simulado en memoria, de modo que funciona sola.

```
cd apps/bodega-mobile
npm start
```

Para que use la API real, pulsa "Modo demostración" bajo el botón de inicio de sesión, elige "Servidor" y escribe la dirección del backend, por ejemplo `http://localhost:3000`.

## Etiquetas QR de los espacios de bodega

La pantalla "Espacios de bodega" muestra el código QR de cada espacio con su número, por ejemplo `B-POL-03`. Para imprimirlas, abre la app en el navegador del computador (http://localhost:8080), entra a esa pantalla y usa "Imprimir etiquetas". Salen tres por fila, con línea de corte.

Al escanear una etiqueta desde la app, en cualquier pantalla con el botón "Escanear código", aparecen las prendas guardadas en ese espacio.

## Etiquetas QR de las prendas

La pantalla "Etiquetas de prendas" muestra el código QR de cada SKU, con el nombre, la talla y el color. Se imprimen igual que las de los espacios, desde el navegador del computador. Al abrir una prenda se puede imprimir una etiqueta por cada unidad en stock, para rotularlas todas.

El QR contiene el SKU. Al escanearlo, la app identifica la talla y el color exactos de la prenda para contarla, moverla o darla de baja.

## Dos direcciones distintas de la app en el navegador

- http://localhost:8080 es la app de Docker: usa el backend y la base de datos reales.
- http://localhost:4200 es el servidor de desarrollo (`npm start`): arranca en modo demostración, con datos de ejemplo que no llegan a la base. La pantalla principal lo avisa. Para conectarlo al backend, pulsa "Modo demostración" en el inicio de sesión, elige "Servidor" y escribe `http://localhost:3000`.

## APK para el teléfono

```
cd apps/bodega-mobile
npm run apk
```

El APK queda en `apps/bodega-mobile/apk/rockstar-bodega.apk`. Cópialo al teléfono y ábrelo para instalarlo; Android pedirá permitir la instalación desde esa fuente.

Para que la app instalada funcione contra el backend:

1. Los contenedores deben estar corriendo en el equipo (`docker compose up -d`).
2. El teléfono debe estar en la misma red Wi-Fi que el equipo.
3. La app sale configurada con la dirección que el equipo tenía al compilar. Si cambió, pulsa "Servidor" bajo el botón de inicio de sesión y escribe la nueva, por ejemplo `http://192.168.1.20:3000`. La dirección del equipo se ve con `ipconfig`, en "Dirección IPv4".

Sin servidor a mano, la misma pantalla permite pasar a "Demostración", que funciona sola con datos de ejemplo.

Otras formas de compilar:

```
npm run apk -- --servidor=http://192.168.1.20:3000   # otra dirección inicial
npm run apk -- --demo                                 # arranca en modo demostración
```

Requisitos para compilar, una sola vez por equipo:

- JDK 21. Si el Java del sistema es más antiguo, indica el JDK en `%USERPROFILE%\.gradle\gradle.properties` con `org.gradle.java.home=<ruta del JDK>`.
- SDK de Android con la plataforma 36, y su ruta en `apps/bodega-mobile/android/local.properties` como `sdk.dir=<ruta>` o en la variable `ANDROID_HOME`.

El APK es de depuración: sirve para instalarlo directamente, no para publicarlo en una tienda. La app habla con el backend por HTTP sin cifrar, lo que es aceptable dentro de la red de la tienda y no fuera de ella.

## Pruebas

```
cd apps/bodega-mobile
npm test -- --watch=false     # pruebas de la app
npm run lint

cd services/api
npm test                      # pruebas unitarias
npm run test:e2e              # pruebas del contrato de la API, con base en memoria
```

Las pruebas de contrato también pueden correr contra los contenedores:

```
$env:API_URL = "http://localhost:3000/api/v1"
npm run test:e2e
```

## Variables del backend

| Variable | Uso | Por defecto |
|---|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL. Obligatoria | |
| `PUERTO` | Puerto en que escucha | `3000` |
| `SEMBRAR_DEMO` | Carga los datos de demostración si la base está vacía | `false` |
| `CORS_ORIGENES` | Orígenes permitidos, separados por coma. Vacío acepta cualquiera | vacío |
| `JWT_CLAVES_DIR` | Carpeta del par de claves que firma los tokens. Se genera si no existe | `claves` |
| `JWT_CLAVE_PRIVADA`, `JWT_CLAVE_PUBLICA` | Claves en formato PEM, en lugar de la carpeta | |
| `DB_POOL_MAX` | Conexiones simultáneas a la base | `10` |
| `MIGRACIONES_DIR` | Carpeta de migraciones | `db/migrations` |

Las cuentas de demostración tienen contraseñas públicas. Fuera de desarrollo, usa `SEMBRAR_DEMO=false`.
