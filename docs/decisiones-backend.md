# Decisiones confirmadas para el backend

Este documento registra las decisiones de producto tomadas durante la planificación. El prototipo actual continúa en memoria; estas reglas describen el backend futuro.

## Alcance y despliegue

- Una sola sucursal al inicio, con empleados y un administrador. Varias sucursales y superadministrador quedan para una etapa posterior.
- Aplicación siempre conectada a internet. Angular, API Java con Spring Boot y PostgreSQL se desplegarán en el mismo OVHcloud VPS-1.
- La base de datos real empezará sin los datos de demostración del prototipo.

## Acceso

- Inicio de sesión mediante usuario y contraseña, con sesiones del servidor. Deben sobrevivir al cierre del navegador y al reinicio de la aplicación; vencen a las 24 horas de inactividad o a los 7 días del inicio, lo que ocurra primero.
- El administrador accede a todas las funciones y gestiona cuentas de empleados. Los empleados solo consultan Inventario, Compras, Ventas, Reportes y su perfil; no pueden modificar datos.
- El primer administrador se crea y recupera mediante un comando privado en el VPS. El administrador puede restablecer contraseñas de empleados y desactivar sus cuentas sin borrar su historial.

## Operaciones

- Cada compra o venta admite varias líneas de cabello, definidas por categoría, longitud, peso y precio por gramo. Registra fecha de creación y, cuando corresponda, fecha de confirmación. Puede estar pendiente, confirmada o anulada; la confirmación se hace desde el detalle.
- Las compras pendientes figuran como cabello por recibir y las ventas pendientes como reservas. El stock físico cambia al confirmar. Si una venta necesita cabello por recibir y ese peso está respaldado, se solicita aceptación y la venta queda pendiente; si no alcanza ni con ese peso, se rechaza la venta completa con faltantes detallados.
- Las ediciones, confirmaciones, anulaciones y pagos de deudas conservan historial. Las deudas son movimientos de efectivo independientes de compras y ventas.

## Cálculos

- El peso del cabello se registra en gramos con hasta dos decimales. Los precios por gramo y los importes en bolivianos también admiten hasta dos decimales.
- El importe de cada línea se calcula como peso por precio por gramo y se redondea a dos decimales, elevando el centavo en los empates (por ejemplo, Bs. 0,125 pasa a Bs. 0,13). El total de una compra o venta es la suma de los importes redondeados de sus líneas.
- Las ventas confirmadas descuentan lotes de compra por antigüedad. Los reportes usan las compras y ventas confirmadas y sus costos de lote; los periodos sin movimientos muestran cero.

## Respaldo y restauración

- El administrador descarga un CSV integral legible desde una computadora. El recordatorio empieza cada 7 días y el intervalo puede modificarse desde Configuración. Conserva manualmente las cuatro copias más recientes. Se acepta una posible pérdida de hasta siete días de datos.
- La restauración se inicia desde el panel del administrador: valida el archivo, muestra vista previa y advertencia, descarga una copia previa del estado actual y exige confirmar que se guardó antes del reemplazo. Sustituye todos los datos incluidos en el CSV, sin combinarlos, en una transacción.
- El CSV no incluye contraseñas ni sesiones. Si existe la base anterior, se conservan las credenciales de las cuentas coincidentes por identificador estable. Un empleado desactivado en la base anterior no se reactiva por una copia antigua. Las sesiones no se cierran por la restauración; cada solicitud vuelve a comprobar existencia, estado y permisos de la cuenta.
- Los detalles del formato y sus limitaciones constan en [respaldos-csv.md](respaldos-csv.md).

## Pendiente de decisión

- Qué hacer si alguien ingresa un peso o importe con más de dos decimales: rechazarlo o redondearlo automáticamente.
