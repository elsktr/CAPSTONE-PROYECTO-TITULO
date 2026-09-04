# Cuervo Negro · Rockstar e-commerce (Ionic Angular + Capacitor)

Tienda online Rock & Metal — ahora en **Ionic Angular** (web + móvil nativo con Capacitor).

## Características

- ✅ App web con Ionic 8 + Angular 18 (standalone components + signals)
- ✅ Móvil nativo (Android / iOS) vía **Capacitor 6**
- ✅ Tienda con catálogo, filtros, carrito
- ✅ Login dual: Cliente (Google) y Administrador (user/pass)
- ✅ Vista admin: Bodega con edición de productos, Finanzas & RRHH
- ✅ Chat de soporte Roxy con respuestas rápidas + fallback a WhatsApp
- ✅ Estado reactivo con Angular Signals

## Estructura

```
src/
├── main.ts                   Entry point
├── index.html                HTML shell
├── global.scss               Estilos globales
├── theme/variables.scss      Ionic theme (dark + accent rojo)
└── app/
    ├── app.config.ts         Providers (router, Ionic, animations)
    ├── app.routes.ts         Lazy-loaded routes
    ├── app.component.ts      Shell (header + tabs + toast)
    ├── data/
    │   ├── models.ts         Interfaces TypeScript
    │   └── seed.ts           Productos, usuarios admin, formatCLP
    ├── services/
    │   ├── auth.service.ts   Login/logout con signals
    │   ├── cart.service.ts   Carrito + checkout
    │   ├── products.service.ts CRUD de productos
    │   └── toast.service.ts  Notificaciones globales
    └── pages/
        ├── entry/            Pantalla inicial (login)
        ├── shop/             Tienda
        ├── cart/             Carrito
        ├── warehouse/        Bodega (admin)
        ├── admin/            Finanzas & RRHH (admin)
        └── support/          Chat Roxy
```

## Desarrollo

```bash
npm install
npm start          # http://localhost:4200
npm run build      # genera www/
```

## Móvil (Capacitor)

```bash
npm run build
npx cap add android   # solo la primera vez
npx cap sync android  # copia www/ a android/
npx cap open android  # abre Android Studio
```

Lo mismo para iOS: `npx cap add ios` (requiere macOS).

## Credenciales de prueba

| Usuario | Clave | Rol |
| --- | --- | --- |
| `elias` | `1234` | Administrador |
| `Jp` | `1234` | Administrador |
| `Exe` | `1234` | Administrador |

Acceso admin: pantalla inicial → "Acceso administrador".

## Stack

- **Angular 18** (standalone, signals, control flow)
- **Ionic 8** (componentes UI mobile-first)
- **Capacitor 6** (Android / iOS wrapper)
- **TypeScript 5.5** (strict)
- **Ionicons** (iconografía)

## Reactividad con Signals

El estado global usa Angular Signals (sin NgRx ni librerías externas):

```typescript
const cart = signal<CartItem[]>([]);
const total = computed(() => cart().reduce((s, i) => s + i.price * i.qty, 0));
```

## Versión legacy

La versión React original está en `react-legacy/`.
