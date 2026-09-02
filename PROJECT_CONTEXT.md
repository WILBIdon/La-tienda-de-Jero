# 🏪 La Tienda El Hueco — POS System

## Descripción
Sistema POS (Point of Sale) simple y efectivo para **tiendas de barrio**.
Diseñado para funcionar al 100% en **móvil**, con mínima complejidad técnica.

## Arquitectura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Google Apps      │────▶│  Google Sheets  │
│   (HTML/JS)     │◀────│  Script (API)     │◀────│  (Base de Datos) │
│   Railway       │     │  GAS_URL          │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

- **Frontend**: HTML estático con Tailwind CSS + Bootstrap Icons
- **Backend**: Google Apps Script (GAS) — API REST gratuita
- **Base de datos**: Google Sheets (3 hojas)
- **Hosting**: Railway (sirve solo archivos estáticos)
- **Repo**: https://github.com/WILBIdon/La-tienda-de-Jero.git (rama `main`)
- **Deploy**: Push a `main` → Railway deploy automático

## Stack Técnico

| Componente | Tecnología |
|---|---|
| HTML/CSS | Tailwind CDN + CSS inline |
| Iconos | Bootstrap Icons CDN |
| Backend API | Google Apps Script |
| DB | Google Sheets |
| Hosting | Railway (estático) |
| Control de versiones | Git + GitHub |

## Estructura de Archivos

```
/
├── index.html              # Toda la app (frontend SPA)
├── apps_script_code.js     # Código del backend (se pega en Google Apps Script)
├── PROJECT_CONTEXT.md      # Este archivo — contexto del proyecto
└── .git/
```

## Google Sheets — Estructura de Hojas

### Hoja 1: "Añadiendo Precios y Calculando Ganancias" (Inventario)
| Columna A | Columna B | Columna C | Columna D |
|---|---|---|---|
| Producto | P. Compra (Costo) | P. Venta | Stock |

### Hoja 2: "Historial"
| ID VENTA | FECHA | PRODUCTO | CANTIDAD | SUBTOTAL |

### Hoja 3: "Cierres Diarios"
| FECHA | DESCRIPCIÓN | ITEMS VENDIDOS | TOTAL DINERO |

## Google Apps Script — Endpoints

**URL Base (GAS_URL):**
```
https://script.google.com/macros/s/AKfycbySOa9gIjlatBuXjzn8zpBJEbQg8Rc1dqaxOVXJuA2IzOx0haMoI-oSQOxLYuulIJ_V/exec
```

### GET (doGet)
Retorna JSON:
```json
{
  "inventario": [...],
  "historial": [...],
  "clock": { "hour": 8, "today": "01/09/2026", "state": "OPEN|CLOSED" }
}
```

### POST (doPost) — Acciones disponibles
| Action | Payload | Descripción |
|---|---|---|
| `crear` | producto, costo, venta, stockInicial | Crear 1 producto |
| `eliminar` | producto | Eliminar producto por nombre |
| `gestionar_stock` | producto, nuevoStock | Actualizar stock |
| `checkout` | items: [{producto, qty, precio, subtotal}] | Procesar venta |
| `revertir_venta` | ventaId | Revertir venta y devolver stock |
| `abrir_caja` | — | Cambiar estado a OPEN |
| `cierre_caja` | — | Cerrar día con resumen Z-Out |
| `crear_masivo` | items: [{producto, costo, venta, stock}] | **PENDIENTE** — Carga masiva |

## Funciones Actuales (v1)

- ✅ Pestaña **Ventas**: carrito, cobrar, recibo preview
- ✅ Pestaña **Gestión**: crear/eliminar producto, ajustar stock (+/-)
- ✅ Pestaña **Historial**: ventas agrupadas por ticket, revertir venta
- ✅ **Apertura/Cierre de caja** manual con contraseña
- ✅ **Búsqueda** de productos en tiempo real
- ✅ Contraseñas: Admin=1234, Auditoría=4321

## Mejoras Implementadas (v2 & v3) ✅

- [x] **⭐ Productos Favoritos Arriba**: Auto-ordenamiento por volumen de ventas en el Historial para mostrar lo más vendido primero con insignia `⭐ TOP`.
- [x] **📝 Sistema de Fiados (Cuentas por cobrar)**: Pestaña `Fiados 📋` dedicada para registrar deudas por cliente, ver total adeudado, marcar como PAGADO y enviar recordatorio automático por WhatsApp `💬`.
- [x] **⚡ Venta Rápida 1-Tap**: Botón directo en la tarjeta del producto para registrar 1 unidad en efectivo al instante sin abrir el carrito.
- [x] **🔢 Selector de Cantidad Personalizado**: Mini-modal táctil con botones rápidos (`x1`, `x2`, `x3`, `x5`, `x10`, `Máx`) eliminando los `prompt()` feos del navegador.
- [x] **📦 Gestión de Stock de Gran Tamaño**: Botones `+1`, `+5`, `+10`, `-1`, `-5` táctiles en cada producto.
- [x] **Botón de Apertura/Cierre en la Cabecera**: Acceso directo arriba junto al nombre (`🟢 ABIERTO` / `🔴 CERRADO`) protegido por PIN `1234`.
- [x] **Bitácora Inalterable de Auditoría**: Hoja permanente en Google Sheets (`Bitacora Inalterable`) que registra absolutamente todo. **NO SE BORRA NUNCA**.
- [x] **Cambio de Precios Protegido**: Botón `🏷️ Cambiar Precio (PIN)` en cada tarjeta de gestión.
- [x] **Carga masiva de inventario** — textarea con parser inteligente.
- [x] **Dashboard resumen del día** — ventas, tickets, cuentas fiadas, alertas stock bajo.
- [x] **Toast notifications & PIN Pad visual** — UI limpia y moderna sin popups del navegador.
- [x] **Recibo compartible** — Web Share API + copiar texto para WhatsApp.
- [x] **Cache offline** — localStorage como fallback.

## Contraseñas del Sistema

| Acción | Contraseña | Uso |
|---|---|---|
| Admin (gestión, stock, crear, abrir/cerrar) | `1234` | Operaciones de admin |
| Auditoría (revertir ventas) | `4321` | Solo revertir ventas |

## Notas de Desarrollo

- La app es un **SPA (Single Page App)** — todo en un solo `index.html`
- El backend usa `mode: 'no-cors'` en los POST (no retorna datos en la respuesta)
- Después de cada acción POST se llama `syncData()` para refrescar datos
- El estado de la tienda (OPEN/CLOSED) se guarda en `PropertiesService` de GAS
- El nombre en la UI dice "La Tienda de Jero" — **DEBE cambiarse a "La Tienda El Hueco"**
