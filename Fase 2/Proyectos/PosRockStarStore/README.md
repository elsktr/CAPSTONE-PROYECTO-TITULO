# POS Rockstar Store

Punto de venta (Ionic React + Vite) para la tienda Rockstar. Opera **dentro de Docker**
detrás de nginx, con proxy `/api/` al backend `App-mobile-docker-backend`.

- App: `http://localhost:8082` → redirige a `/login`, POS en `/pos`
- Salud API (vía proxy): `http://localhost:8082/api/v1/salud`

## Requisitos

- Docker Desktop con la red externa `rockstar_default` creada por el backend
- Backend corriendo: `App-mobile-docker-backend` (`db + api + app + tienda`, API en `api:3000`)

## Comandos Docker

```bash
# Levantar (construir + iniciar) en segundo plano
docker compose up --build -d

# Ver estado / salud del contenedor
docker ps --format "{{.Names}} {{.Status}}"

# Verificar proxy API (debe responder {"estado":"ok"})
curl http://localhost:8082/api/v1/salud

# Ver logs
docker compose logs -f pos

# Detener (conserva todo, no hay volúmenes propios)
docker compose down

# Flujo dev de un comando
npm run dev:up
```

## Variables de entorno

| Variable       | Dónde                  | Valor producción            | Descripción                              |
| -------------- | ---------------------- | --------------------------- | ---------------------------------------- |
| `API_URL`      | contenedor (compose)   | `http://api:3000`           | Backend dentro de `rockstar_default`     |
| `POS_PUERTO`   | host (compose)         | `8082`                      | Puerto publicado (`${POS_PUERTO:-8082}`) |
| `VITE_API_URL` | build (Dockerfile)     | `/api/v1`                   | Mismo origen: nginx proxea, sin CORS     |
| `VITE_API_URL` | desarrollo (`.env`)    | `http://localhost:3000/api/v1` | Solo `npm run dev` fuera de Docker    |

Ver `.env.example` (desarrollo) y `.env.production` (valores del contenedor).

## Cuentas y flujo de caja

- **Vendedor** (`/login`): email `vendedor@rockstar.cl` + contraseña del backend.
  Solo `VENDEDOR` puede cobrar; `BODEGA` y `GERENTE` entran pero el backend rechaza la
  venta. Con "Recordarme" la sesión dura 30 días (`refreshToken` en `localStorage`);
  sin marcarla, dura la jornada (8 h).
- **Cliente mostrador** (modal "Identificar cliente" al cobrar): cuenta rol `CLIENTE`,
  p. ej. `cliente@rockstar.cl`. Sin sesión cliente no se puede cobrar. Queda anotado en
  la venta y en el comprobante.
- **Venta**: `POST /ventas/pos` con el token del vendedor. Registra la venta pagada,
  descuenta el stock al momento y devuelve el comprobante. Sin flete ni pedido de
  despacho: el comprador se lleva la prenda.
- **Stock**: sale de la sala de ventas. Si la sala no alcanza, el backend responde
  `409 EXISTENCIA_EN_BODEGA` y el POS ofrece "Retirar de bodega"; al aceptar reenvía
  con `permitirBodega` y la misma clave de idempotencia.
- **Medios de pago**: efectivo, débito o crédito. La tarjeta se pasa por el terminal
  físico de la tienda: el POS solo registra el medio (Webpay es de la tienda web).
- **Boleta**: comprobante interno sin validez tributaria, con id, fecha, vendedor,
  cliente, líneas, total y medio; impresión con CSS print-only (`window.print()`). Tras
  la venta: stock se refresca, carrito se vacía y el registro de jornada
  (`GET /ventas/pos`, ventas del día del vendedor) suma la venta.

## Pruebas

```bash
npm run test.unit -- --run   # Vitest (API client + smoke App)
npm run test.e2e             # Cypress contra http://localhost:8082 (requiere contenedores)
```

La suite e2e (26 tests) usa intercepts con `cypress/fixtures/catalogo-integracion.json`
(7 variantes) salvo salud/login reales. Notas:

- Cypress desactiva animaciones CSS vía `cypress/support/e2e.ts` (determinismo visual).
- Viewport e2e: 1280×1080 (pantalla de caja típica).
- Las imágenes del fixture son SVG `data:` URI para no depender de red externa.

## Troubleshooting

- **Contenedor `unhealthy` o `/api/v1/salud` no responde**: el backend no está
  corriendo o no comparte la red. Verifica `docker network ls | grep rockstar_default`
  y que `rockstar-api-1` esté `healthy`. Luego `docker compose up --build -d`.
- **Login redirige pero `/pos` queda vacío / error de catálogo**: revisa el proxy —
  `curl http://localhost:8082/api/v1/inventario/catalogo` debe devolver JSON.
  Revisa `nginx.conf` (`proxy_pass ${API_URL}` y `try_files ... /index.html`).
- **Imágenes no cargan (placeholder o "Sin imagen")**: `ProductImage` reintenta 3
  veces con backoff (500 ms × 2^n) y luego muestra estado de error con botón
  "Reintentar". Las fotos (`assets/prendas/*` según el backend) se sirven desde el
  propio contenedor: copia en `public/prendas/` (origen: bodega-mobile
  `src/assets/prendas/`, ver `CREDITOS.md`), resueltas por `getImageUrl()` a
  `/prendas/<archivo>` con caché de 7 días en nginx. Confirma que el backend sirve
  `imagenUrl` en `GET /inventario/catalogo`.
- **`docker compose up` falla por red externa**: crea/levanta primero el backend,
  que es quien crea `rockstar_default` (`external: true` aquí, no la crea).
- **Puerto ocupado**: cambia el mapeo con `POS_PUERTO=8083 docker compose up -d`.
