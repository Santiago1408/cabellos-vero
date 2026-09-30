# La Magia del Cabello · Prototipo de compra y venta de cabello

Prototipo navegable en Angular con componentes standalone, TypeScript y Tailwind CSS. Administra un catálogo de cabello por categoría, longitud y peso para un negocio de una sola tienda.

## Ejecutar

```bash
npm install
npm start
```

Abrir `http://localhost:4200`. La portada muestra el tablero. Para presentar el acceso, visitar `/ingresar`; allí se puede entrar como administrador o usuario de demostración.

## Pantallas

- Inicio, inventario, detalle de cabello, proveedores, compras, ventas, deudas, reportes y configuración.
- Ingreso y registro de demostración.
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

Los cambios de datos viven solo en memoria y se reinician al recargar. Los roles permiten mostrar las diferencias de interfaz, sin autenticación ni autorización de servidor. Los gráficos de Inicio y Reportes se calculan a partir de compras y ventas confirmadas; los meses sin movimientos muestran cero. El stock inicial de demostración se trata como lotes iniciales con los costos ficticios existentes. El costo de cada venta y el valor del inventario se calculan por FIFO.

Las compras confirmadas suman stock físico y las ventas confirmadas lo descuentan. Las compras pendientes permanecen como stock por recibir; las ventas pendientes reservan capacidad. Cuando una venta requiere cabello por recibir, el sistema pide confirmación y la registra como pendiente hasta que la compra se confirme.

Para cambiar el color principal, editar `--color-primary`, `--color-primary-hover` y `--color-primary-soft` al inicio de `src/styles.css`. El resto de componentes consume esas variables.
