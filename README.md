# Cabellos Vero · Prototipo de inventario

Prototipo navegable en Angular con componentes standalone, TypeScript y Tailwind CSS. Reproduce y adapta las pantallas de `references/` para un negocio de una sola tienda.

## Ejecutar

```bash
npm install
npm start
```

Abrir `http://localhost:4200`. La portada muestra el tablero. Para presentar el acceso, visitar `/ingresar`; allí se puede entrar como administrador o usuario de demostración.

## Pantallas

- Inicio, inventario, detalle de producto, proveedores, pedidos, reportes, mi tienda y configuración.
- Ingreso y registro de demostración.
- Formularios modales para productos, proveedores y pedidos; búsqueda, filtros, paginación y exportación CSV.
- Vistas adaptadas para escritorio, tableta y móvil.

## Arquitectura

- `src/app/pages/`: rutas de cada función, cargadas bajo demanda.
- `src/app/shared/`: navegación, cabecera e iconos.
- `src/app/data/demo-store.ts`: modelos, datos iniciales y estado en memoria.
- `src/styles.css`: estilos compartidos y paleta global.

Los cambios de datos viven solo en memoria y se reinician al recargar. Los roles permiten mostrar las diferencias de interfaz, sin autenticación ni autorización de servidor. Las cifras y los gráficos son datos ilustrativos para la presentación.

Para cambiar el color principal, editar `--color-primary`, `--color-primary-hover` y `--color-primary-soft` al inicio de `src/styles.css`. El resto de componentes consume esas variables.
