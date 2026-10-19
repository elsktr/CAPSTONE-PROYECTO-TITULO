# Informe de avance · Fase 2 — RockStore

**Guía 2.4 · Desarrollo Proyecto APT · Asignatura Capstone**

| | |
|---|---|
| **Proyecto** | RockStore: plataforma omnicanal de inventario y ventas para una tienda de ropa estilo rock |
| **Equipo** | Exequiel Tapia · Elías Figueroa · Jorge Piña |
| **Repositorio** | [elsktr/CAPSTONE-PROYECTO-TITULO](https://github.com/elsktr/CAPSTONE-PROYECTO-TITULO) — código en [`Fase 2/Proyectos`](../Proyectos) |
| **Documentos** | [Informe (Word)](<Evidencias de documentación/Informe_Avance_Fase2_RockStore.docx>) · [Presentación (PowerPoint)](<Evidencias de documentación/Presentacion_Avance_Fase2_RockStore.pptx>) · [Capturas del sistema](<Evidencias de sistema Aplicación Base de datos/capturas>) |

## Contenido

1. [Resumen del avance](#1-resumen-del-avance)
2. [Monitoreo del plan de trabajo](#2-monitoreo-del-plan-de-trabajo)
3. [Ajustes a partir del monitoreo](#3-ajustes-a-partir-del-monitoreo)
4. [Progress summary (English)](#4-progress-summary-english)
5. [Referencias](#referencias)

---

## 1. Resumen del avance

En la Fase 2 el equipo pasó del diseño a una solución de software funcionando. Se construyeron e integraron cuatro componentes que comparten **una sola base de datos**:

- una **API REST** en NestJS con 44 endpoints;
- una **app móvil de bodega** (Ionic Angular y Capacitor), instalable como APK en Android;
- una **tienda web** (Ionic Angular), que incluye el panel del gerente;
- un **punto de venta, POS** (Ionic React).

Todo el sistema se despliega con Docker Compose, en contenedores independientes, con un solo comando.

| Tienda web y probador 3D | Panel del gerente |
|---|---|
| ![Probador virtual 3D con recomendación de talla](<Evidencias de sistema Aplicación Base de datos/capturas/02-tienda-probador-3d.png>) | ![Balance diario en el panel de Finanzas](<Evidencias de sistema Aplicación Base de datos/capturas/04-finanzas-balance.png>) |
| **Punto de venta (POS)** | **App de bodega** |
| ![POS con buscador, escáner y cobro](<Evidencias de sistema Aplicación Base de datos/capturas/07-pos-venta.png>) | <img src="Evidencias de sistema Aplicación Base de datos/capturas/09-bodega-inicio.png" alt="Inicio de la app de bodega" width="260"> |

### Objetivos específicos

| Objetivo | Estado | Qué hay hoy |
|---|---|---|
| Sincronizar el stock | ✅ Cumplido | Bodega, POS y tienda web descuentan del mismo inventario en PostgreSQL. La operación de stock bloquea las filas dentro de una transacción y no se duplica al reintentar, así que una prenda no se puede vender dos veces. |
| Reducir las ventas perdidas | ✅ Cumplido | El catálogo web y el POS muestran la disponibilidad real. Si la sala de ventas no tiene unidades, el POS ofrece retirarlas de bodega. |
| Mejorar la experiencia de compra | ✅ Cumplido y ampliado | Se sumaron un probador virtual 3D que recomienda la talla y Roxy, una asistente de soporte. |
| Dar trazabilidad | ✅ Cumplido | Cada ingreso, merma, traspaso, conteo y venta queda registrado con su responsable. Las prendas y los espacios de bodega tienen código QR. |
| Aumentar la rentabilidad con datos | 🟡 En curso | El panel de Finanzas muestra las ventas de cada canal, el ticket promedio, el margen y el balance diario de ingresos y gastos. Un modelo predictivo recomienda en qué invertir. Faltan algunos KPI, los reportes PDF/Excel y las integraciones reales de Webpay y Starken. |

### Avance del backlog

De las **20 historias de usuario** del plan original:

| Estado | Historias |
|---|---|
| ✅ Implementadas | 13 |
| 🟢 Muy avanzadas | 2 — US-17 Dashboard y US-18 KPI |
| 🔁 Con integración simulada | 2 — US-14 Webpay y US-16 Starken |
| 🟡 Parcial | 1 — US-04 Repositorio e integración continua |
| ⏳ No iniciadas | 2 — US-19 Reportes y US-20 Alertas de stock crítico |

Además se sumaron **7 historias nuevas** (US-21 a US-27): el probador 3D con cuerpos y prendas realistas, las medidas opcionales del cliente, las pruebas de la tienda web, la prenda idéntica a su foto y la asistente Roxy.

### Objetivos

El objetivo general se mantiene: **digitalizar la gestión de inventario de la tienda, conectando bodega, punto de venta y e-commerce en una sola fuente de verdad.** Se ajustaron dos objetivos específicos:

- **Experiencia de compra:** se amplió con el probador virtual 3D. La talla es una causa frecuente de devolución en la venta de ropa en línea, y el probador ataca directamente ese problema.
- **Rentabilidad:** se amplió con un modelo predictivo de demanda e inversión. En la Fase 1 la analítica avanzada quedó fuera del alcance. Se incorporó porque los datos de ventas de ambos canales ya estaban disponibles, y responde a la necesidad de decidir las compras con datos y no "a ojo".

### Metodología

Se mantiene **Scrum** con sprints cortos y revisión periódica, apoyado en un tablero Kanban en Trello. Las historias de usuario están escritas en formato Gherkin, con criterios de aceptación y una métrica de aprobación. Los ajustes fueron:

- **Desarrollo guiado por especificaciones con OpenSpec:** cada cambio relevante (plataforma, probador 3D, POS) parte de una propuesta, un diseño y una lista de tareas versionados en el repositorio antes de programar.
- **Pruebas automatizadas como criterio de "terminado":** cada funcionalidad se entrega con pruebas unitarias o de punta a punta (Vitest, Cypress y pruebas de contrato de la API contra PostgreSQL).
- **Ramas y Pull Requests en GitHub:** cada funcionalidad se desarrolla en su propia rama y se integra a `main` después de pasar las pruebas.

### Evidencias de avance

Las evidencias están en este repositorio, carpeta [`Fase 2/Proyectos`](../Proyectos), y en el tablero de Trello "RockStore APT — Historias de Usuario".

#### Programación

| Componente | Ubicación | Qué incluye |
|---|---|---|
| API NestJS | `App-mobile-docker-backend/services/api` | Módulos de usuarios y roles, inventario, ventas, logística, pagos y analítica |
| App de bodega | `App-mobile-docker-backend/apps/bodega-mobile` | 13 pantallas: ingreso, conteo, mermas, traspasos, búsqueda, espacios, etiquetas QR y envíos |
| Tienda web | `App-mobile-docker-backend/apps/e-commerce` | Catálogo, carrito, pago, pedidos, probador 3D, soporte con Roxy, Finanzas e Inversión |
| POS | `PosRockStarStore` | Venta, boleta, escáner, cobro con máquina de tarjeta y registro de jornada |

#### Almacenamiento de datos

PostgreSQL 17 con **5 esquemas** (usuarios, inventario, ventas, pagos y logística), **36 tablas** y **11 migraciones** versionadas en `db/migrations`. Tiene restricciones de integridad, claves de idempotencia y bloqueo de filas para el stock.

#### Documentación

- README con instalación y uso, en la [raíz del repositorio](../../README.md).
- [Modelo de datos](../../docs/modelo-datos.md).
- Especificaciones de OpenSpec en `openspec/changes`.
- Historias de usuario con Gherkin y métricas en Trello.

#### Resguardo de la calidad

- **Pruebas automatizadas, 581 casos:**

  | Componente | Pruebas |
  |---|---|
  | API (unitarias y de punta a punta, incluida una de concurrencia del stock) | 191 |
  | App de bodega | 251 |
  | POS (unitarias, Cypress y máquina de cobro simulada) | 87 |
  | Tienda web | 52 |

- **Seguridad:**
  - contraseñas con Argon2id;
  - sesiones JWT firmadas con RS256 y renovación revocable;
  - rutas protegidas por defecto y control de acceso por rol;
  - los datos de tarjeta nunca se guardan, solo los últimos cuatro dígitos y el código de autorización.
- **Contratos tipados compartidos** (`packages/contracts`) entre la API y los clientes, para detectar incompatibilidades al compilar.

#### Capturas del sistema

<details>
<summary>Ver todas las capturas</summary>

| | |
|---|---|
| ![Catálogo de la tienda web](<Evidencias de sistema Aplicación Base de datos/capturas/01-tienda-catalogo.png>) Catálogo de la tienda web | ![Roxy, asistente de soporte](<Evidencias de sistema Aplicación Base de datos/capturas/03-tienda-roxy.png>) Roxy responde con el catálogo y los pedidos reales |
| ![Tienda web y tienda física por separado](<Evidencias de sistema Aplicación Base de datos/capturas/05-finanzas-tiendas.png>) Finanzas: cada tienda por separado | ![Recomendaciones de inversión](<Evidencias de sistema Aplicación Base de datos/capturas/06-finanzas-inversion.png>) Modelo predictivo de inversión |
| <img src="Evidencias de sistema Aplicación Base de datos/capturas/10-bodega-etiquetas-qr.png" alt="Etiquetas QR" width="240"> Bodega: etiquetas QR | <img src="Evidencias de sistema Aplicación Base de datos/capturas/11-bodega-ingreso.png" alt="Ingreso de mercadería" width="240"> Bodega: ingreso de mercadería |
| <img src="Evidencias de sistema Aplicación Base de datos/capturas/08-pos-maquina-cobro.png" alt="Máquina de cobro simulada" width="240"> POS: máquina de cobro simulada | |

</details>

---

## 2. Monitoreo del plan de trabajo

| Competencia | Actividad | Recursos | Duración | Responsable | Observaciones | Estado | Ajustes |
|---|---|---|---|---|---|---|---|
| Gestionar proyectos informáticos | Planificación: backlog de 20 historias de usuario con Gherkin y métricas, tablero Trello y sprints | Trello, OpenSpec | 2 semanas (septiembre) | Todo el equipo | Facilitador: la propuesta de Fase 1 ya definía problema, KPI y alcance | ✅ Completado | Se agregaron las historias US-21 a US-27 |
| Desarrollar una solución de software | Diseño de la arquitectura | NestJS, Docker, OpenSpec | 2 semanas (septiembre) | Exequiel Tapia | Dificultad: un gateway con 5 microservicios exigía mucha infraestructura para 3 integrantes | ✅ Completado | API única dividida en módulos por área, con contratos compartidos |
| Construir modelos de datos | Modelo de datos y migraciones en PostgreSQL | PostgreSQL 17, SQL | 2 semanas (septiembre) | Jorge Piña y Elías Figueroa | Facilitador: el modelo relacional de Fase 1 sirvió de base | ✅ Completado | 5 esquemas, 36 tablas y 11 migraciones; se sumaron pagos con máquina de cobro e imágenes |
| Desarrollar una solución de software | Autenticación y control de acceso por rol | JWT RS256, Argon2id | 1 semana (septiembre) | Elías Figueroa | Dificultad: Firebase agregaba una dependencia externa al manejo de roles | ✅ Completado | Autenticación propia en la API en lugar de Firebase |
| Desarrollar una solución de software | App de bodega: ingreso, inventario, mermas, traspasos, conteos y QR | Ionic Angular, Capacitor | 4 semanas (sept.–oct.) | Elías Figueroa y Jorge Piña | Facilitador: modo de demostración que funciona sin servidor | ✅ Completado | Se genera un APK instalable en Android |
| Desarrollar una solución de software | Punto de venta: venta, comprobante, escáner y cobro con tarjeta | Ionic React, Vite, Cypress | 4 semanas (octubre) | Jorge Piña y Exequiel Tapia | Dificultad: falla al confirmar con Enter en "Identificar cliente" | ✅ Completado (falla en corrección) | Cliente opcional; la tarjeta se cobra en la máquina física |
| Desarrollar una solución de software | Tienda web: catálogo, carrito, checkout y estado del pedido | Ionic Angular | 4 semanas (octubre) | Exequiel Tapia | Facilitador: contratos tipados compartidos con la API | ✅ Completado | Angular en lugar de React, igual que la app de bodega |
| Desarrollar una solución de software | Integración con Webpay Plus y Starken | Adaptadores en la API | 3 semanas (oct.–nov.) | Elías Figueroa | Dificultad: aún no hay credenciales de Transbank ni cuenta en Starken | 🔁 En curso (simulados) | Adaptadores intercambiables; se usarán credenciales de integración |
| Desarrollar una solución de software | Dashboard y KPI (panel de Finanzas) | API de ventas, Angular | 3 semanas (oct.–nov.) | Exequiel Tapia y Elías Figueroa | Facilitador: ventas de ambos canales en una misma tabla | 🟢 En curso | Ya muestra balance diario y cada tienda por separado; faltan clientes distintos, despachos en 24 h y exactitud del inventario |
| Desarrollar una solución de software | Modelo predictivo de demanda e inversión | Suavizado exponencial, Syntetos-Boylan, Holt | 1 semana (octubre) | Exequiel Tapia | Facilitador: historial de ventas de ambos canales | ✅ Completado | Actividad nueva, fuera del alcance de Fase 1 |
| Desarrollar una solución de software | Probador virtual 3D con recomendación de talla | three.js, Blender, MakeHuman | 2 semanas (octubre) | Elías Figueroa | Dificultad: realismo del cuerpo y de las prendas | ✅ Completado | Actividad nueva; falta la prueba con 10 usuarios |
| Desarrollar una solución de software | Asistente de soporte Roxy | Angular, Vitest | 1 semana (octubre) | Elías Figueroa | Facilitador: catálogo y pedidos ya disponibles en la API | ✅ Completado | Actividad nueva (US-27) |
| Desarrollar una solución de software | Reportes PDF/Excel (US-19) | API de ventas | 2 semanas (noviembre) | Exequiel Tapia | Depende del panel de Finanzas | ⏳ No iniciado | Se reprograma para noviembre |
| Desarrollar una solución de software | Alertas de stock crítico (US-20) | API de inventario, app de bodega | 2 semanas (noviembre) | Jorge Piña | Requiere definir un stock mínimo por producto | ⏳ No iniciado | Se reprograma para noviembre |
| Realizar pruebas de certificación de productos y procesos | Pruebas automatizadas unitarias y de punta a punta | Vitest, Cypress, PostgreSQL embebido | Continuo | Todo el equipo | Facilitador: entorno local con base en memoria | 🟢 En curso (581 pruebas) | Se adoptó como criterio de "terminado" |
| Gestionar proyectos informáticos | Repositorio, ramas y CI (US-04) | GitHub, GitHub Actions | 1 semana (noviembre) | Exequiel Tapia | Dificultad: sin pipeline, las pruebas se corren a mano | 🟡 En curso | Falta el workflow que bloquee la fusión si fallan |
| Desarrollar una solución de software | Implantación con Docker | Docker Compose | 1 semana (octubre) | Todo el equipo | Dificultad: configuración de Docker y WSL en Windows | ✅ Completado | Sistema completo en contenedores con un comando |
| Gestionar proyectos informáticos | Piloto y capacitación | Tienda, equipo de bodega | 2 semanas (diciembre) | Todo el equipo | Requiere el sistema estable y las integraciones reales | ⏳ No iniciado (según plan) | Sin ajustes |

---

## 3. Ajustes a partir del monitoreo

### Factores que han facilitado el desarrollo

- **Base sólida de la Fase 1:** el problema, los KPI, el modelo de datos y los casos de uso ya estaban definidos, lo que permitió empezar a programar con un backlog claro.
- **Contratos tipados compartidos y Docker:** la API y los tres clientes comparten los mismos tipos, y todo el sistema se levanta igual en cualquier computador.
- **Pruebas automatizadas:** permitieron integrar el trabajo de distintos integrantes y detectar errores antes de llegar a `main`.
- **Herramientas libres:** Blender y MakeHuman (licencia CC0) permitieron construir el probador 3D sin costo de licencias.

### Dificultades y acciones

| Dificultad | Acción |
|---|---|
| **Credenciales externas:** Transbank y Starken exigen trámites | Los pagos y los despachos se aislaron detrás de adaptadores simulados. Webpay se conectará con las credenciales públicas del ambiente de integración de Transbank |
| **Arquitectura inicial compleja:** un gateway con cinco microservicios era desproporcionado para tres integrantes | Se construyó una API modular que mantiene la separación por áreas |
| **Configuración del entorno:** Docker Desktop no iniciaba por un conflicto con WSL | Se documentó la solución en el README |
| **Integración de ramas paralelas:** el POS y Finanzas avanzaron en ramas distintas que se tocaban en los mismos archivos | Se creó la rama `integracion/app-mobile` para unirlas, resolver los conflictos y correr todas las pruebas. Se fusionó en `main` el 16 de octubre |
| **Documentación desfasada:** las tareas de OpenSpec y el tablero no reflejaban lo construido | Se actualizó Trello con el estado real de cada historia; la documentación de OpenSpec se pondrá al día |

### Actividades ajustadas o eliminadas

- **Arquitectura:** se reemplazó el gateway con cinco microservicios por una API única dividida en módulos. Mantiene la misma separación por áreas, con menos infraestructura que mantener y probar para un equipo de tres personas.
- **Tecnología de la tienda web:** se usó Ionic Angular en lugar de React, igual que la app de bodega, para compartir conocimientos y componentes. El POS se mantuvo en React.
- **Autenticación:** se reemplazó Firebase Authentication por autenticación propia con JWT RS256 y Argon2id, para controlar los roles en la API y no depender de un servicio externo.
- **Pagos y despachos:** Webpay y Starken funcionan con adaptadores simulados mientras se obtienen las credenciales. El resto del flujo de compra funciona completo.
- **Pago con tarjeta en la tienda:** el POS registra el cobro hecho en la máquina física de la tienda, en lugar de pasar por Webpay, que corresponde al canal web.
- **Actividades agregadas:** probador virtual 3D, asistente Roxy y modelo predictivo de inversión, por su aporte directo a los objetivos de experiencia de compra y rentabilidad.

No se eliminaron actividades del plan original.

### Actividades no iniciadas o retrasadas

| Actividad | Por qué | Estrategia |
|---|---|---|
| Reportes PDF/Excel (US-19) y alertas de stock crítico (US-20) | Se priorizaron el panel de Finanzas y el modelo predictivo, de los que dependen | Desarrollarlas en noviembre, reutilizando las consultas de ventas y de inventario que ya existen |
| Integración continua (US-04) | Pendiente | Un workflow de GitHub Actions que ejecute lint, compilación y pruebas en cada Pull Request, y proteger la rama `main` |
| Webpay y Starken reales (US-14 y US-16) | Falta de credenciales | Usar el ambiente de integración de Transbank y solicitar la cuenta comercial de Starken. El cambio se limita a los adaptadores |
| KPI pendientes (US-18) | Clientes distintos, despachos en 24 h y exactitud del inventario | Calcularlos con datos que la base ya registra |
| Validación con usuarios | Requiere el sistema estable | Probar el probador con 10 personas (meta: acertar la talla en 8 de 10) y medir el tiempo de búsqueda (meta: 1,5 min o menos), antes del piloto |

---

## 4. Progress summary (English)

During Phase 2, the team moved from design to a working software solution. RockStore now consists of four integrated components that share a single PostgreSQL database: a NestJS REST API, a mobile warehouse app built with Ionic Angular and Capacitor, an Ionic Angular web store, and an Ionic React point-of-sale (POS) application. The whole system is deployed with Docker Compose and can be started with a single command.

The main objective of Phase 1 has been achieved: stock is now synchronized across the warehouse, the physical store and the online store. Stock operations lock the affected rows inside a transaction and are idempotent, so the same item can never be sold twice. Every stock movement is recorded with its reason and the person responsible, and every item and storage location has its own QR code.

Several adjustments were made along the way. The API gateway with five microservices was replaced by a single modular API, which keeps the separation by business area while reducing the infrastructure that a three-person team has to maintain. Firebase Authentication was replaced by in-house authentication based on RS256-signed JWTs and Argon2id password hashing. Since the Transbank and Starken credentials are still pending, payments and shipping run behind simulated adapters that can be swapped for the real services without changing the rest of the system.

The team also delivered features beyond the original scope: a 3D virtual fitting room that recommends a size based on the customer's height, weight and body measurements; Roxy, a rule-based support assistant that answers with real catalog and order data; a manager dashboard with a daily income and expense balance for each sales channel; and a demand forecasting model that recommends where to invest. Quality is backed by 581 automated tests. The remaining work for the next sprints includes PDF/Excel reports, low-stock alerts, continuous integration, the real payment and shipping integrations, and user testing before the pilot.

---

## Referencias

- Cohn, M. (2004). *User stories applied: For agile software development*. Addison-Wesley.
- Hyndman, R. J., & Athanasopoulos, G. (2021). *Forecasting: Principles and practice* (3.ª ed.). OTexts. https://otexts.com/fpp3/
- OWASP Foundation. (s.f.). *Password storage cheat sheet*. https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Schwaber, K., & Sutherland, J. (2020). *La guía de Scrum*. https://scrumguides.org
- Syntetos, A. A., & Boylan, J. E. (2005). The accuracy of intermittent demand estimates. *International Journal of Forecasting, 21*(2), 303–314. https://doi.org/10.1016/j.ijforecast.2004.10.001
