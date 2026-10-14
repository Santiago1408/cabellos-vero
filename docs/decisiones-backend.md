# Decisiones confirmadas para el backend

Este documento registra las decisiones de producto tomadas durante la planificación. El prototipo actual continúa en memoria; estas reglas describen el backend futuro.

## Alcance y despliegue

- Una sola sucursal al inicio, con empleados y un administrador. Varias sucursales y superadministrador, incluida su estructura de datos específica, quedan para una etapa posterior.
- Aplicación siempre conectada a internet. Angular, API Java con Spring Boot y PostgreSQL se desplegarán con Docker en el mismo OVHcloud VPS-1. El desarrollo y las pruebas serán locales; en el VPS habrá solo producción.
- El backend se incorporará al repositorio privado actual de GitHub. Cada cambio aprobado en la rama principal se publicará automáticamente después de pasar las comprobaciones acordadas.
- En GitHub Free, un repositorio privado no dispone de protecciones de rama ni aprobaciones de despliegue exigibles. El flujo gratuito será revisar el cambio y sus comprobaciones antes de incorporarlo manualmente a `main`; el despliegue automático se activará al llegar a esa rama. Si se necesita imponer esas reglas técnicamente dentro de GitHub, habrá que revisar un plan de pago.
- La base de datos real empezará sin los registros de demostración del prototipo, pero con las categorías y longitudes actuales y stock cero.
- Se prevén como máximo unos cinco empleados durante el primer año y unas 800 transacciones **por año**.
- Para comenzar se usará un subdominio gratuito con HTTPS. El nombre concreto se elegirá al configurar el VPS.

## Acceso

- Inicio de sesión mediante usuario y contraseña, con sesiones del servidor. Deben sobrevivir al cierre del navegador y al reinicio de la aplicación; vencen a las 24 horas de inactividad o a los 7 días del inicio, lo que ocurra primero.
- Las contraseñas definitivas y temporales exigen un mínimo de 8 caracteres; esta regla también se aplica en el prototipo.
- Los intentos fallidos de ingreso tendrán esperas progresivas, sin bloqueo permanente de la cuenta. La desactivación de un empleado cerrará inmediatamente todas sus sesiones.
- El administrador accede a todas las funciones y gestiona cuentas de empleados. Los empleados solo consultan Inventario, Compras, Ventas, Reportes y sus datos de perfil; no pueden modificar datos del negocio ni sus datos personales. Pueden cambiar su propia contraseña indicando la actual.
- Cuando un empleado cambia su contraseña, su sesión actual continúa y se cierran las demás sesiones de esa cuenta. El cambio se registra en el historial sin conservar ni mostrar la contraseña anterior o la nueva.
- El primer administrador se crea y recupera mediante un comando privado en el VPS; su nombre de usuario se elegirá al ejecutar ese comando. El administrador puede crear cuentas de empleados, restablecer sus contraseñas y desactivarlas sin borrar su historial. La contraseña asignada al crear una cuenta o restablecerla es temporal: en el primer inicio de sesión con ella, el empleado solo puede acceder al cambio de contraseña hasta que defina una nueva. Al restablecer una contraseña, el backend cierra de inmediato todas las sesiones de ese empleado. El estado de cambio obligatorio debe persistir en la base de datos y no debe poder saltarse llamando directamente a la API.
- El administrador podrá cambiar su propia contraseña desde Configuración, verificando la actual y cerrando sus demás sesiones. El comando privado de recuperación cerrará todas las sesiones del administrador.

## Operaciones

- Cada compra o venta admite varias líneas de cabello, definidas por categoría, longitud, peso y precio por gramo. Registra fecha de creación y, cuando corresponda, fecha de confirmación. Puede estar pendiente, confirmada o anulada; la confirmación se hace desde el detalle.
- Se permitirán recepciones parciales en compras y entregas parciales en ventas, con cantidades por línea dentro de una misma operación. Una operación permanece **Pendiente** mientras falte cualquier cantidad; el detalle mostrará el progreso por línea. Cada recepción o entrega guarda su propia fecha y hora real, además del momento en que se registró en el sistema, incluso si hay varios movimientos el mismo día, y conserva el precio por gramo de su línea. Si se registra después de que ocurrió, se pedirán su fecha y hora reales. Al completar todas las cantidades pasa a **Confirmado**.
- El administrador podrá editar solo las cantidades aún pendientes, sin reducir ninguna línea por debajo de lo ya recibido o entregado. Al anular una operación parcialmente completada, se anula solamente su saldo pendiente; los movimientos ya realizados siguen en inventario, costos e historial.
- Si un movimiento realizado tiene un error de fecha, hora o cantidad, el administrador podrá corregirlo con motivo obligatorio, validaciones de stock y reservas, recálculo histórico y registro de valores anteriores y nuevos. También podrá anular un movimiento registrado completamente por error, conservándolo en el historial y haciéndolo inefectivo solo si el inventario sigue siendo coherente. La corrección o anulación puede cambiar el estado entre Pendiente y Confirmado según el progreso de todas las líneas.
- Las compras pendientes figuran como cabello por recibir y las ventas pendientes como reservas. Las reservas apartan primero el stock físico disponible y después el cabello por recibir. El stock físico cambia con cada cantidad recibida o entregada. Si una venta necesita cabello por recibir y ese peso está respaldado, se solicita aceptación y la venta queda pendiente; al llegar el cabello seguirá pendiente hasta registrar la entrega real al cliente. Si no alcanza ni con ese peso, se rechaza la venta completa con faltantes detallados.
- Se guardará la hora efectiva de los movimientos para ordenarlos, pero solo se mostrará en el detalle de la transacción. Al editar precios o fechas de operaciones confirmadas se recalcularán los márgenes históricos afectados y se conservará el cambio en el historial.
- Las compras se vincularán al proveedor por identificador estable y mostrarán su nombre actualizado incluso en compras antiguas. En ventas se registrará únicamente el nombre del cliente.
- Compras y ventas tendrán sus propios pagos y saldos; se podrán registrar anticipos hasta el total acordado. Cada pago guarda fecha, importe, método (efectivo, QR, transferencia u otro) y referencia opcional. Un pago incorrecto podrá corregirse o anularse con motivo, conservando el valor anterior y el nuevo en el historial; un pago anulado deja de integrar el total pagado. Una corrección del importe total de la operación no puede dejarlo por debajo de lo ya pagado. Las deudas seguirán siendo movimientos de efectivo ajenos a estas operaciones. No habrá facturas fiscales ni archivos adjuntos en esta primera versión.
- No se diseñará por ahora un flujo de excedentes o devoluciones al anular el saldo pendiente de una operación parcialmente completada: el cliente indicó que esa combinación no ocurre en su negocio.
- Las ediciones, confirmaciones, anulaciones y pagos conservan historial. El motivo será obligatorio en toda edición.

## Cálculos

- El peso del cabello se registra en gramos con dos decimales, igual que las balanzas del negocio. Los precios por gramo y los importes en bolivianos también se manejan con dos decimales. Se validará esta precisión antes de guardar; los datos ingresados no se redondearán silenciosamente.
- El importe de cada línea se calcula como peso por precio por gramo y se redondea a dos decimales, elevando el centavo en los empates (por ejemplo, Bs. 0,125 pasa a Bs. 0,13). El total de una compra o venta es la suma de los importes redondeados de sus líneas.
- Cada cantidad entregada descuenta lotes de compra por antigüedad. Los reportes reconocen compras, ingresos, costos y margen bruto por las cantidades efectivamente recibidas o entregadas, incluso si la operación todavía está Pendiente; los periodos sin movimientos muestran cero. Los pagos y anticipos no determinan el momento de reconocimiento de esos resultados.
- Los resultados muestran margen bruto; no se registrarán otros gastos para calcular un resultado neto en esta etapa.

## Respaldo y restauración

- El administrador descarga un CSV integral legible desde una computadora. El recordatorio empieza cada 7 días y el intervalo puede modificarse desde Configuración. Conserva manualmente las cuatro copias más recientes. Se acepta una posible pérdida de hasta siete días de datos.
- La restauración se inicia desde el panel del administrador: valida el archivo, muestra vista previa y advertencia, descarga una copia previa del estado actual y exige confirmar que se guardó antes del reemplazo. Sustituye todos los datos incluidos en el CSV, sin combinarlos, en una transacción.
- El CSV no incluye contraseñas ni sesiones. Si existe la base anterior, se conservan las credenciales de las cuentas coincidentes por identificador estable. Un empleado desactivado en la base anterior no se reactiva por una copia antigua. La restauración por sí sola no cierra sesiones; cada solicitud vuelve a comprobar existencia, estado y permisos de la cuenta. Esto es distinto del restablecimiento de contraseña, que sí cierra las sesiones del empleado afectado.
- Los detalles del formato y sus limitaciones constan en [respaldos-csv.md](respaldos-csv.md).
