# Fase 3 — Evidencias grupales

Entrega final del Capstone **RockStore**: plataforma omnicanal de inventario y ventas que conecta la bodega, el punto de venta y la tienda web sobre un solo stock.

Equipo: Exequiel Tapia · Elías Figueroa · Jorge Piña

## Contenido

| Evidencia | Descripción |
|---|---|
| [`Proyecto RockStore/`](<Proyecto RockStore>) | Código completo del sistema al 22-11-2026, con todas las ramas fusionadas en `main` (commit `914d0669`). |
| [`RockStore_Presentacion_Final.pptx`](RockStore_Presentacion_Final.pptx) | Presentación final, con notas del orador. |
| [`RockStore_Presentacion_Final.pdf`](RockStore_Presentacion_Final.pdf) | La misma presentación en PDF. |

## Qué incluye el proyecto

- `Proyecto RockStore/App-mobile-docker-backend`: API en NestJS, base de datos PostgreSQL, app de bodega (Ionic Angular y Android) y tienda web con probador virtual 3D, Docker Compose.
- `Proyecto RockStore/PosRockStarStore`: punto de venta (Ionic React y Android) y terminal de cobro simulada.

Integraciones incluidas en esta entrega:

- **Webpay Plus** en el ambiente de integración de Transbank: el pago confirmado crea el pedido que bodega despacha.
- **Starken**: cotización, despacho y seguimiento, en modo simulado hasta contar con credenciales; adaptador REST listo.

Para instalar y ejecutar el sistema, ver el README de cada carpeta del proyecto.

## Cifras al 22-11-2026

| Indicador | Valor |
|---|---|
| Pruebas automatizadas aprobadas | 652 (API 256, bodega 222, tienda 71, punto de venta 103) |
| Endpoints de la API | 55 |
| Base de datos | 5 esquemas, 39 tablas, 17 migraciones |
| Stock de una venta del POS visible en la web | 29 ms (mediana de 30 ventas) |
| Compras simultáneas por la última unidad | 40 intentos, 1 venta, stock nunca negativo |
| Probador 3D | 17.472 combinaciones de prenda, talla y cuerpo sin errores |

Las métricas de negocio (ventas, exactitud del inventario y talla correcta con usuarios reales) se miden en el piloto. La matriz de riesgos y la gestión de cada riesgo están en las diapositivas 17 y 18 de la presentación.

## Nota sobre la copia del código

`Proyecto RockStore/` es una copia fija del código entregado. El desarrollo sigue en `Fase 2/Proyectos`, que es la carpeta que usa la integración continua.
