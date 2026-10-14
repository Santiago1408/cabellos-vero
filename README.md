# La Magia del Cabello · Prototipo de compra y venta de cabello

Prototipo navegable en Angular con componentes standalone y TypeScript. Administra un catálogo de cabello por categoría, longitud y peso para un negocio de una sola tienda.

## Ejecutar

```bash
npm install
npm start
```

Abrir `http://localhost:4200/ingresar`. La cuenta fija de demostración del administrador usa `admin` / `CabelloDemo2026!`. Desde Empleados, el administrador puede crear cuentas de prueba para ingresar con usuario y contraseña.

## Pantallas

- Inicio, inventario, detalle de cabello, proveedores, compras, ventas, deudas, empleados, reportes y configuración.
- Ingreso de demostración con cuenta de administrador y empleados creados en memoria.
- Catálogo de combinaciones de categoría y longitud con precios de compra/venta, color, calidad y existencias en gramos.
- Manejo de cuentas por cobrar y por pagar, edición de deudas, abonos, filtros y exportación CSV.
- Formularios modales para productos, proveedores, compras y ventas; edición de movimientos, filtros, ordenación, paginación y exportación CSV.
- Compras y ventas con varios cabellos por operación, precio por gramo, confirmación desde el detalle y movimientos pendientes separados en inventario.
- Vistas adaptadas para escritorio, tableta y móvil.

## Arquitectura

- `src/app/pages/`: rutas de cada función, cargadas bajo demanda.
- `src/app/shared/`: navegación, cabecera e iconos.
- `src/app/data/demo-store.ts`: modelos, datos iniciales y estado en memoria.
- `src/styles.css`: estilos compartidos y paleta global.

Los cambios de datos y las cuentas de empleados viven solo en memoria y se reinician al recargar. El acceso y las contraseñas de esta versión son únicamente para la demostración; la autenticación y autorización reales deberán implementarse en el backend. Los empleados pueden consultar Inventario, Compras, Ventas, Reportes y su perfil. Las demás secciones son exclusivas del administrador. Los gráficos de Inicio y Reportes se calculan a partir de compras y ventas confirmadas; los meses sin movimientos muestran cero. El stock inicial de demostración se trata como lotes iniciales con los costos ficticios existentes. El costo de cada venta y el valor del inventario se calculan por lotes, empezando por el más antiguo.

El administrador puede descargar desde Configuración un CSV integral sin cifrar con el estado actual del prototipo. Los CSV por sección incluyen identificadores, fechas y detalles adicionales. El formato y sus límites de restauración están documentados en [docs/respaldos-csv.md](docs/respaldos-csv.md).
La frecuencia del recordatorio de respaldo se configura en días desde el panel del administrador; comienza en 7 días y se reinicia cuando confirma que guardó el archivo descargado. Solo el intervalo y la fecha confirmada persisten en este navegador; los datos del negocio siguen en memoria.

Las compras confirmadas suman stock físico y las ventas confirmadas lo descuentan. Las compras pendientes permanecen como stock por recibir; las ventas pendientes reservan capacidad. Cuando una venta requiere cabello por recibir, el sistema pide confirmación y la registra como pendiente hasta que la compra se confirme.

Para cambiar el color principal, editar `--color-primary`, `--color-primary-hover` y `--color-primary-soft` al inicio de `src/styles.css`. El resto de componentes consume esas variables.
