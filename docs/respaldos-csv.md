# Respaldo CSV del prototipo

En **Configuración → Respaldo de datos**, el administrador puede descargar un archivo `respaldo-completo-cabello-AAAA-MM-DD.csv.enc`. El archivo contiene un CSV cifrado, no un CSV legible directamente. Los CSV de Compras, Ventas, Inventario, Proveedores y Deudas sirven para consulta; el respaldo integral reúne todas las secciones aunque haya filtros activos.

## Contenido

El CSV integral tiene las columnas `Tipo de registro`, `Identificador` y `Datos completos JSON`. Separa columnas con punto y coma y codifica el texto en UTF-8 con BOM. La primera fila de datos es un manifiesto con versión, fecha de exportación, moneda, unidad, zona horaria y cantidad de registros de cada tipo. Después incluye configuración, categorías, longitudes, lotes iniciales, productos, proveedores, compras, ventas, deudas, empleados y asignaciones de coste calculadas. Los objetos de compras, ventas, deudas y empleados incluyen sus líneas, pagos e historiales completos. Los identificadores y fechas se conservan tal como están en el prototipo.

Las contraseñas de empleados no se exportan. En el prototipo solo existen en memoria y nunca deben aparecer en un CSV. Las sesiones activas tampoco se exportan. Cuando se implemente el backend, su respaldo principal será el archivo restaurable de PostgreSQL, que sí contendrá los hashes de contraseñas; el importador CSV será una vía adicional de recuperación y tendrá que pedir restablecer las contraseñas que no estén en el archivo.

## Descifrar

En una computadora con Node.js, ejecutar:

```sh
node scripts/decrypt-backup.mjs respaldo-completo-cabello-AAAA-MM-DD.csv.enc respaldo.csv
```

El comando solicita la contraseña sin mostrarla, verifica la autenticidad del contenido con AES-256-GCM y crea `respaldo.csv` sin sobrescribir un archivo existente. El encabezado binario es `LMCB1`, seguido de 16 bytes de sal, 12 bytes de IV y el texto cifrado. La clave se deriva con PBKDF2-HMAC-SHA-256 y 600 000 iteraciones. Guardar la contraseña por separado del respaldo.

## Restauración futura

El prototipo todavía no tiene base de datos ni importador. Para que el CSV sirva tras un fallo del VPS, el backend deberá aceptar este formato versionado, validar el manifiesto y todas las referencias antes de modificar datos, e importar todo en una transacción. El inventario debe restaurarse desde el estado guardado de productos; al importar también compras y ventas, no se deben volver a aplicar sus movimientos al stock. El importador deberá conservar identificadores, estados, fechas, pagos e historiales, reconstruir los lotes iniciales y exigir el cambio de contraseñas de las cuentas importadas.

Una copia semanal guardada únicamente en la computadora del administrador puede perderse junto con esa computadora y puede tener hasta siete días de antigüedad. La copia automática incluida de OVHcloud conserva solo la última copia durante 24 horas.
