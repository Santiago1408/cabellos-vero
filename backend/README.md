# Backend: desarrollo local

La API se inicia con Java 21, Spring Boot 4.1.1 y PostgreSQL 18.6. Ya incluye migraciones, sesiones persistidas, el comando privado del administrador, autenticación, gestión de empleados, catálogos de cabello, proveedores, compras, ventas, inventario y reportes calculados. La interfaz principal aún utiliza datos de demostración; `/sistema` inicia la integración con datos reales.

## Requisitos locales

- Docker Engine o Docker Desktop con Compose.
- Para compilar o ejecutar fuera de Docker: **JDK 21** (incluye `javac`). El repositorio incluye `mvnw`, así que no hace falta instalar Maven por separado. Tener solo el entorno de ejecución de Java no basta para compilar.

## Iniciar con Docker

Desde `backend/`:

Si tu usuario no tiene acceso al daemon de Docker, antepón `sudo` a los comandos `docker compose` siguientes. No hace falta añadir el usuario al grupo `docker` para trabajar en local.

```bash
cp -n .env.local.example .env.local
```

Si acabas de crear `.env.local`, cambia `DB_PASSWORD` por una contraseña local propia. El archivo está ignorado por Git. Después:

```bash
docker compose --env-file .env.local -f compose.local.yaml up --build -d
docker compose --env-file .env.local -f compose.local.yaml ps
```

La API estará en `http://localhost:8080/actuator/health`. PostgreSQL escucha solo en `127.0.0.1:5432`, por lo que no queda expuesto en la red. Para detener los contenedores sin borrar datos:

```bash
docker compose --env-file .env.local -f compose.local.yaml down
```

El volumen `cabello_postgres_local` conserva la base entre reinicios. Las migraciones Flyway crean las categorías y longitudes actuales, con cero operaciones y cero stock, y preparan las tablas de sesiones, cuentas e historial.

## Base local de pruebas aislada

La configuración `compose.test.yaml` levanta otra base y otra API, separadas de las de desarrollo. Usa PostgreSQL en `127.0.0.1:5433`, la API en `127.0.0.1:8081`, un volumen propio y una cookie de sesión diferente. Ninguno de los comandos siguientes debe incluir `down -v`: eso borraría la base de pruebas.

Desde `backend/`, prepara una sola vez el archivo privado de variables:

```bash
cp -n .env.test.example .env.test
```

Edita `DB_PASSWORD` en `.env.test` y usa una clave local distinta de la de desarrollo. El archivo está ignorado por Git. En esta máquina ya se creó con una clave aleatoria. Para iniciar la base y la API:

```bash
sudo docker compose --env-file .env.test -f compose.test.yaml up --build -d
sudo docker compose --env-file .env.test -f compose.test.yaml ps
curl --silent --show-error http://127.0.0.1:8081/actuator/health/readiness
```

Espera unos segundos si la API aún está arrancando. Flyway crea el esquema y el catálogo, sin operaciones. La respuesta de salud debe ser `{"status":"UP"}`. La cuenta de administrador de desarrollo **no** existe en esta base. Créala en una terminal interactiva, con un usuario y contraseña exclusivos de pruebas:

```bash
sudo docker compose --env-file .env.test -f compose.test.yaml run --rm --no-deps api --spring.main.web-application-type=none --app.admin-command=create
```

Desde la raíz del repositorio, inicia Angular en otra terminal:

```bash
npm run start:test
```

Abre `http://127.0.0.1:4201/sistema`. Ese puerto usa el proxy `src/proxy.test.conf.json`, dirigido a la API de pruebas. `npm start` sigue conectado a la API de desarrollo en el puerto 8080. Para detener los contenedores de pruebas conservando los datos:

```bash
sudo docker compose --env-file .env.test -f compose.test.yaml down
```

Esta base permite practicar los flujos sin afectar la base de desarrollo. Empieza vacía; el administrador puede cargar el stock físico anterior al sistema desde **Inventario → Ver o corregir inventario inicial**. El procedimiento está en [stock-inicial.md](../docs/stock-inicial.md).

## Crear el primer administrador

Con la base de datos en marcha, reconstruye la API después de incorporar el código de cuentas:

```bash
docker compose --env-file .env.local -f compose.local.yaml up --build -d
```

Después, ejecuta en una **terminal interactiva**:

```bash
docker compose --env-file .env.local -f compose.local.yaml run --rm --no-deps api --spring.main.web-application-type=none --app.admin-command=create
```

El comando pide el nombre de usuario y la contraseña dos veces; al teclear la contraseña no se muestran caracteres. No pongas la contraseña en argumentos, variables de entorno ni archivos. El nombre de usuario admite letras, números, puntos, guiones y guiones bajos, sin espacios. La contraseña requiere al menos ocho caracteres. El comando falla si ya existe un administrador.

Si se pierde el acceso, el operador con acceso privado al servidor podrá ejecutar el mismo comando cambiando `create` por `recover`. Esto permite elegir un nuevo usuario y contraseña y revoca las sesiones anteriores de esa cuenta. Es un procedimiento excepcional, no una función del panel ni un endpoint HTTP.

## Autenticación de la API

La ruta Angular `/sistema` usa `ApiClient` y `AuthSession` para ingresar con una cuenta real, cambiar una contraseña temporal y consultar Inventario, Proveedores, Compras y Ventas. El administrador puede gestionar catálogos, proveedores, compras y ventas; los empleados tienen acceso de consulta. El resto del frontend sigue en memoria. En desarrollo, `npm start` escucha en `127.0.0.1:4200` y dirige `/api/**` al backend local en `127.0.0.1:8080`, de modo que el navegador mantiene la cookie de sesión en el mismo origen:

1. `GET /api/auth/csrf` abre una sesión y devuelve `headerName` y `token`. El cliente conserva la cookie `SESSION` y envía el token en ese encabezado para cada solicitud que modifica datos.
2. `POST /api/auth/login` recibe JSON con `username` y `password`, más la cookie y el encabezado CSRF. Devuelve el identificador, nombre visible, rol y estado de cambio obligatorio. Al ingresar, cambia el identificador de sesión y descarta el token CSRF anterior; el cliente debe solicitar uno nuevo.
3. `GET /api/auth/me` devuelve la cuenta asociada a la sesión vigente. Para empleados incluye nombre visible, CI, fecha de nacimiento y celular, de solo lectura.
4. `POST /api/auth/logout` requiere el token CSRF actualizado y cierra la sesión.
5. `PUT /api/auth/profile` permite al administrador actualizar su `fullName` visible sin cambiar el `username` de acceso. Guarda el valor anterior y el nuevo en el historial de la cuenta.
6. `POST /api/auth/password` requiere la sesión y el token CSRF actualizado. Recibe `currentPassword` y `newPassword` (mínimo ocho caracteres), mantiene la sesión actual y cierra las demás. El historial registra el evento sin guardar contraseñas ni hashes.

La sesión se guarda en PostgreSQL, vence después de 24 horas sin actividad o 7 días desde el ingreso y su cookie persiste al cerrar el navegador. Cada solicitud protegida vuelve a consultar si la cuenta está activa, cuál es su rol y si su versión de acceso sigue vigente. Tras varios intentos fallidos, el servidor exige esperas progresivas de hasta cinco minutos y responde `429` con `Retry-After` cuando corresponde. En desarrollo local la cookie permite HTTP; en producción exige HTTPS.

## Gestión de empleados

Estas rutas requieren una sesión de **administrador**. Todas las escrituras requieren la cookie de sesión y el encabezado CSRF obtenido en `GET /api/auth/csrf` después del ingreso. El servidor no permite crear ni editar cuentas de administrador por HTTP. Una cuenta desactivada permanece en la base y en el historial.

| Método y ruta | Uso |
| --- | --- |
| `GET /api/employees` | Lista los empleados, activos y desactivados, sin contraseñas ni historial. |
| `GET /api/employees/{id}` | Devuelve el empleado y su historial de cambios. |
| `POST /api/employees` | Crea una cuenta. Recibe `username`, `fullName`, `ci`, `birthDate` (`AAAA-MM-DD`) y `phone`. Devuelve `employee` y `temporaryPassword`; muestra y entrega esa clave al empleado, pues no podrá consultarse después. |
| `PUT /api/employees/{id}` | Modifica esos cinco datos y exige `reason`. |
| `POST /api/employees/{id}/deactivate` | Desactiva la cuenta, cierra sus sesiones y exige `reason`. |
| `POST /api/employees/{id}/reactivate` | Reactiva la cuenta con su contraseña vigente y exige `reason`. Si ya no conoce su clave, usa también el restablecimiento. |
| `POST /api/employees/{id}/reset-password` | Genera una nueva clave temporal, cierra sus sesiones, obliga a cambiarla en el próximo ingreso y exige `reason`. |

Las tres últimas acciones reciben JSON como `{"reason":"Corrección solicitada por el administrador"}`. La edición envía todos los datos del empleado más `reason`. Los usuarios y CI no se pueden repetir; las contraseñas nunca aparecen en el historial. La clave temporal generada tiene 20 caracteres y debe cambiarse en `POST /api/auth/password` antes de llamar a cualquier otra ruta protegida. Si falta o es inválido el token CSRF, la API responde `403`; si la sesión es de empleado, estas rutas responden `403`.

## Catálogos de cabello

`GET /api/catalog/categories` y `GET /api/catalog/lengths` permiten consultar las categorías y longitudes actuales con cualquier sesión válida. Se puede consultar una opción individual añadiendo `/{code}` o `/{centimeters}`. El administrador puede modificarlas con las siguientes rutas; todas las escrituras requieren el token CSRF:

| Método y ruta | Cuerpo JSON | Resultado |
| --- | --- | --- |
| `POST /api/catalog/categories` | `{"displayName":"Nueva categoría"}` | `201`, devuelve `code` estable y `displayName`. |
| `DELETE /api/catalog/categories/{code}` | Ninguno | `204` si se quitó. |
| `POST /api/catalog/lengths` | `{"centimeters":65}` | `201`, devuelve la longitud. |
| `DELETE /api/catalog/lengths/{centimeters}` | Ninguno | `204` si se quitó. |

No se admiten nombres de categoría repetidos aunque cambien mayúsculas o espacios exteriores, longitudes repetidas ni valores no positivos. Debe quedar al menos una categoría y una longitud. Las futuras tablas de operaciones referenciarán estos catálogos mediante claves foráneas; esas referencias impedirán eliminar opciones ya usadas. Agregar una opción no crea stock ni combinaciones vacías en Inventario.

## Proveedores

Todas las rutas `/api/suppliers` requieren una sesión de administrador. `GET /api/suppliers` lista los proveedores y `GET /api/suppliers/{id}` muestra uno. `GET /api/suppliers/{id}/history` devuelve el historial de creación, ediciones y eventual eliminación; el historial permanece consultable por ID después de eliminar un proveedor sin referencias.

| Método y ruta | Cuerpo JSON | Resultado |
| --- | --- | --- |
| `POST /api/suppliers` | `name`, `phone`, `city`, `address`, `mapsUrl` | `201` y proveedor creado. |
| `PUT /api/suppliers/{id}` | Los mismos campos y `reason` | Proveedor actualizado. |
| `DELETE /api/suppliers/{id}` | `{"reason":"Motivo de la eliminación"}` | `204` si no tiene referencias. |

Solo `name` y `phone` son obligatorios. `city`, `address` y `mapsUrl` pueden enviarse vacíos u omitirse. El enlace, cuando se registra, debe ser HTTPS de Google Maps. Los nombres no pueden repetirse ignorando mayúsculas. La edición y la eliminación exigen un motivo de 1 a 500 caracteres; el historial guarda actor, fecha y valores anteriores/nuevos. Las compras referencian al proveedor por UUID, muestran su nombre vigente e impiden eliminarlo si ya aparece en una compra.

## Compras: registro, edición y recepciones

`GET /api/purchases` y `GET /api/purchases/{id}` permiten consultar compras con una sesión de administrador o empleado. La lista muestra proveedor, fecha, estado, pesos, importes, total pagado y saldo; el detalle añade líneas, progreso recibido, recepciones con fecha/hora real y de registro, pagos e historial. Las escrituras requieren administrador y token CSRF.

| Método y ruta | Uso |
| --- | --- |
| `POST /api/purchases` | Crea una compra con varias líneas; opcionalmente recibe todo en el mismo registro. |
| `PUT /api/purchases/{id}` | Edita proveedor, fecha y líneas, con motivo e historial; exige la versión actual. |
| `POST /api/purchases/{id}/receipts` | Registra una recepción parcial de una o más líneas y crea los lotes físicos correspondientes. |
| `PUT /api/purchases/{id}/receipts/{receiptId}` | Corrige fecha/hora real y pesos de una recepción, con motivo e historial. |
| `POST /api/purchases/{id}/receipts/{receiptId}/void` | Anula una recepción errónea sin borrar su rastro. |
| `POST /api/purchases/{id}/cancel` | Anula solo el saldo pendiente, con `{"reason":"..."}`; conserva las recepciones y lotes existentes. |
| `POST /api/purchases/{id}/payments` | Registra un pago o anticipo. |
| `PUT /api/purchases/{id}/payments/{paymentId}` | Corrige un pago con motivo e historial. |
| `POST /api/purchases/{id}/payments/{paymentId}/void` | Anula un pago sin borrarlo. |

Ejemplo de creación pendiente (UUID reales para `requestKey` y `supplierId`, y códigos del catálogo):

```json
{
  "requestKey": "14e3ac41-ab32-4b85-ac3b-8778b52f1cbf",
  "supplierId": "07d46174-67ce-45c1-99be-78b8e70f79cb",
  "operationDate": "2026-10-14",
  "lines": [
    {"categoryCode": "normal", "lengthCm": 38, "weight": "400.00", "pricePerGram": "13.00"},
    {"categoryCode": "premium", "lengthCm": 60, "weight": "150.00", "pricePerGram": "18.50"}
  ],
  "receiveNow": false
}
```

Para crearla ya confirmada, usa `receiveNow: true` y añade `effectiveAt` con fecha, hora y zona reales, por ejemplo `2026-10-14T16:30:00-04:00`. Para una recepción posterior, envía `requestKey`, `effectiveAt` y `items: [{"lineId":"UUID de la línea","weight":"125.00"}]`. La operación sigue `PENDING` hasta completar todas las líneas; entonces pasa a `CONFIRMED`. Cada línea conserva su precio por gramo y calcula el importe como peso × precio con redondeo `HALF_UP` a dos decimales. Se rechazan pesos y precios con más de dos decimales y recepciones que exceden el pendiente. Repetir una solicitud con la misma clave y el mismo contenido devuelve la compra existente; reutilizar la clave con otros datos responde `409`.

Para editar, lee primero el detalle y envía en `PUT` la `summary.version` como `expectedVersion`, junto con `supplierId`, `operationDate`, todas las `lines` que permanecerán y un `reason` de 1 a 500 caracteres. Cada línea existente lleva su `id`; una línea nueva no lo lleva. Omitir una línea sin recepciones la elimina. La respuesta incluye la versión nueva y el historial con los valores anteriores y nuevos. Si otra acción cambió la compra entre la lectura y la edición, se responde `409` y hay que recargar el detalle. No se puede reducir un peso por debajo de lo recibido, quitar o cambiar el tipo de una línea ya recibida, ni cambiar los pesos de una compra confirmada. Al cambiar el precio de una línea recibida se actualiza el costo de sus lotes; cuando se incorporen ventas, esa operación deberá recalcular los márgenes históricos afectados.

Para corregir una recepción, envía `expectedVersion`, `effectiveAt`, `reason` y `items` con **todas las mismas líneas originales** y sus pesos corregidos. No se cambian las líneas que componen esa recepción; cada peso debe seguir siendo positivo y el total recibido de cada línea no puede superar lo acordado. El momento de registro (`recordedAt`) permanece intacto. La corrección actualiza el lote físico y puede devolver una compra confirmada a pendiente o completar una pendiente. Para anularla, envía `{"expectedVersion": 2, "reason": "Recepción duplicada"}` al endpoint `/void`; el movimiento y sus lotes quedan marcados como anulados, se excluyen del stock efectivo y permanecen en el historial. Si ya hubo entregas de ventas, el sistema recalcula qué lotes las abastecieron según su fecha real. Si la corrección o anulación deja una entrega sin stock físico en ese momento, rechaza el cambio completo con `409`. El costo vigente del lote puede consultarse desde cada entrega para calcular nuevamente los márgenes históricos.

Para registrar un pago, envía `requestKey` (UUID único), `paymentDate` (`AAAA-MM-DD`), `amount`, `method` (`CASH`, `QR`, `TRANSFER` u `OTHER`) y `reference` opcional. La fecha no puede ser futura en Bolivia y el importe debe ser positivo, con dos decimales como máximo. La suma de pagos activos no puede superar el total acordado; en una compra anulada no puede superar el valor recibido. La clave de solicitud evita duplicados por reintentos. El detalle conserva también los pagos anulados con `voidedAt`, pero no los suma. Para corregir, envía todos los datos del pago más `expectedVersion` y `reason`; para anular, solo `expectedVersion` y `reason`. Ambas acciones guardan valores anteriores y nuevos. La edición del importe de la compra, la corrección de recepciones y la anulación del saldo pendiente se rechazan si dejarían el total exigible por debajo de los pagos activos.

El estado `CANCELED` deja el importe exigible en el valor efectivamente recibido. Las recepciones ya realizadas permanecen como lotes. Los reportes y la integración del frontend se incorporarán en las siguientes etapas. No uses estos endpoints para operaciones reales hasta completar esas etapas y conectar el frontend.

## Ventas: reservas y entregas parciales

`GET /api/sales` y `GET /api/sales/{id}` permiten consultar ventas con una sesión de administrador o empleado. `POST /api/sales` registra una venta inmediata con entrega completa; `POST /api/sales/reservations` registra una venta **Pendiente** con varias líneas; `PUT /api/sales/{id}` edita cliente, fecha y líneas con motivo e historial; `POST /api/sales/{id}/deliveries` registra una entrega real parcial o completa; `POST /api/sales/{id}/cancel` anula el saldo pendiente con motivo. Las escrituras requieren administrador y token CSRF. Una reserva no descuenta stock físico; cada entrega sí lo hace.

| Método y ruta | Uso |
| --- | --- |
| `PUT /api/sales/{id}/deliveries/{deliveryId}` | Corrige fecha/hora real y pesos de una entrega, con motivo e historial. |
| `POST /api/sales/{id}/deliveries/{deliveryId}/void` | Anula una entrega errónea si el inventario sigue siendo coherente. |
| `POST /api/sales/{id}/payments` | Registra un cobro o anticipo. |
| `PUT /api/sales/{id}/payments/{paymentId}` | Corrige un cobro con motivo e historial. |
| `POST /api/sales/{id}/payments/{paymentId}/void` | Anula un cobro conservando su historial. |

Ejemplo de reserva:

```json
{
  "requestKey": "9c4a8cbb-2b0d-487a-ac73-7e412f45b769",
  "customerName": "Cliente de ejemplo",
  "operationDate": "2026-10-14",
  "acceptPendingStock": false,
  "lines": [
    {"categoryCode": "normal", "lengthCm": 38, "weight": "200.00", "finalWeight": "210.00", "pricePerGram": "21.00"}
  ]
}
```

`weight` representa los gramos de cabello que se reservan y salen del inventario. `finalWeight` representa los gramos facturables después de agregar las ligas; debe ser igual o mayor que `weight`. El ingreso acordado de la línea es `finalWeight × pricePerGram`, mientras que el costo se obtiene únicamente del cabello consumido de los lotes. Los registros previos a esta corrección mantienen el importe anterior porque la migración iguala inicialmente ambos pesos.

La API agrupa las líneas de la misma categoría y longitud antes de evaluar disponibilidad. Primero considera el stock físico libre y después el cabello pendiente de recibir, restando las reservas existentes. Si alguna línea supera ambos, rechaza toda la venta con `INSUFFICIENT_HAIR` y un desglose de pesos. Si el stock físico libre no alcanza pero el pendiente sí, responde `PENDING_STOCK_CONFIRMATION_REQUIRED`; el administrador debe aceptar ese uso y repetir la solicitud con `acceptPendingStock: true`. `requestKey` evita duplicados por reintentos. Las compras no se pueden reducir, corregir o anular si ello dejaría reservas sin respaldo. La reserva no confirma la venta: seguirá pendiente hasta registrar la entrega real.

Para una venta inmediata, envía los mismos datos a `POST /api/sales`, sustituye `acceptPendingStock` por `effectiveAt` con la fecha, hora y zona de la entrega real (por ejemplo, `2026-10-14T16:30:00-04:00`). Solo usa stock físico libre. La reserva y la entrega se guardan en una misma transacción: si falta cabello o falla la asignación de lotes, se rechaza la venta completa y no queda una operación pendiente a medias. Una solicitud repetida con el mismo `requestKey` y los mismos datos devuelve la venta creada; si se reutiliza con otros datos, responde `409`.

Para registrar una entrega, envía un UUID único en `requestKey`, la fecha y hora **reales** en `effectiveAt` con zona horaria, y `items` con `lineId`, `weight` (cabello) y `finalWeight` (peso con ligas) por cada línea entregada. Por ejemplo:

```json
{
  "requestKey": "9bd81dac-70b5-4568-b06e-dc9cad2f688f",
  "effectiveAt": "2026-10-14T16:30:00-04:00",
  "items": [{"lineId": "UUID de la línea", "weight": "100.00", "finalWeight": "105.00"}]
}
```

La entrega descuenta solo `weight` del stock. Su ingreso es `finalWeight × pricePerGram`; cada entrega parcial lleva sus dos pesos y no puede dejar menos peso final pendiente que cabello pendiente. La entrega no puede exceder lo pendiente ni el stock físico. Además, el stock debe haber existido en la fecha real indicada. El detalle muestra cuánto se entregó, cuánto falta, cuándo se entregó y registró cada movimiento, y de cuáles lotes salió el cabello. La venta pasa a `CONFIRMED` solo cuando se entregan todas las líneas. El mismo `requestKey` evita registrar dos veces un reintento.

Para corregir una entrega, envía `expectedVersion`, `effectiveAt`, `reason` y `items` con **todas las mismas líneas originales** y sus pesos corregidos. Cada peso debe seguir siendo positivo; ninguna línea puede superar la cantidad acordada. Para anularla, envía `{"expectedVersion": 2, "reason": "Entrega duplicada"}` al endpoint `/void`. La hora de registro original se conserva. Ambos cambios recalculan los lotes consumidos por todas las entregas afectadas según sus fechas reales y vuelven a comprobar reservas y cobros. Si alguna entrega histórica queda sin stock, se rechaza todo con `409`. La corrección puede devolver una venta confirmada a pendiente o completar una pendiente; el detalle conserva el movimiento anulado y sus valores anteriores.

Para editar una venta, envía la `summary.version` como `expectedVersion`, los datos completos, todas las líneas que permanecerán y `reason` de 1 a 500 caracteres. Las líneas existentes llevan su `id`; las nuevas no. En una venta pendiente se puede quitar una línea sin entregas omitiéndola. Una línea ya entregada conserva su tipo y un peso acordado al menos igual al entregado. En una venta confirmada solo se pueden corregir cliente, fecha de operación y precios; no se cambian tipos ni cantidades entregadas. Se vuelve a comprobar la disponibilidad restante de las ventas pendientes antes de guardar y se responde `409` si otra acción cambió la versión. La anulación libera solo el saldo pendiente; el cabello ya entregado y su historial permanecen. Una edición o anulación se rechaza si deja el importe exigible por debajo de los cobros activos.

Para registrar un cobro, envía `requestKey` (UUID único), `paymentDate` (`AAAA-MM-DD`), `amount`, `method` (`CASH`, `QR`, `TRANSFER` u `OTHER`) y `reference` opcional. La fecha no puede ser futura en Bolivia y el importe tiene dos decimales como máximo. Se admiten anticipos hasta el total acordado; en una venta anulada, el límite es el valor entregado. Para corregir el cobro, envía sus datos nuevos más `expectedVersion` y `reason`; para anularlo, solo `expectedVersion` y `reason`. El historial conserva los valores anteriores y nuevos, y un cobro anulado deja de sumarse. La lista y el detalle incluyen `agreedTotal`, `deliveredValue`, `payableTotal`, `paidTotal` y `balance`.

## Inventario

Estas rutas son de solo lectura y están disponibles para administrador y empleados con sesión válida:

| Método y ruta | Uso |
| --- | --- |
| `GET /api/inventory` | Una fila por categoría y longitud con compras o lotes de apertura registrados. |
| `GET /api/inventory/{categoryCode}/{lengthCm}` | Stock y movimientos físicos del tipo seleccionado. |
| `GET /api/inventory/pending-purchases` | Líneas de compras todavía por recibir. |
| `GET /api/inventory/reserved-sales` | Líneas de ventas todavía reservadas. |

Cada fila indica `physicalStock`, `pendingPurchase` y `reservedSale` en gramos. También desglosa cuánto de la reserva se cubre con cabello físico (`reservedFromPhysical`) y cuánto con compras pendientes (`reservedFromPending`), además de `freePhysical` y `freePending`. Una combinación nueva aparece cuando se registra una compra o un lote de apertura de ese tipo; agregarla solo al catálogo no crea una fila de stock vacío.

El detalle muestra la apertura como `OPENING`, las recepciones activas como `PURCHASE` y las entregas activas como `SALE`, ordenadas por fecha y hora reales. Cada movimiento incluye operación, origen o cliente, peso de cabello con signo, precio por gramo, importe y saldo físico acumulado. Las salidas muestran además el peso final facturado con ligas. Las entradas incluyen el lote y su peso restante. Los importes de movimientos parciales reparten los centavos del total de su línea sin duplicarlos. Los movimientos anulados se consultan desde el detalle y el historial de su compra o venta, pues no forman parte del stock efectivo. Inventario no ofrece endpoints para modificar cantidades directamente.

### Apertura de inventario

Solo el administrador puede usar `GET /api/inventory/opening`, `POST /api/inventory/opening/preview`, `POST /api/inventory/opening` y `PUT /api/inventory/opening`. La apertura se crea **una vez y antes de la primera compra o venta**. La fecha y hora de corte se indican con zona horaria; cada lote lleva categoría, longitud, `weight`, `costPerGram`, `costEstimated`, `order` (orden de antigüedad), `originDate` opcional y `note` opcional. Los pesos y costos admiten dos decimales. La vista previa devuelve lotes, peso y valor total; luego el administrador confirma la carga en Inventario. Las ventas consumen estos lotes según el orden registrado, y su costo contribuye al margen bruto. Su valor inicial no figura como compra del periodo.

El detalle de apertura devuelve `header.version`, lotes con peso inicial y restante e historial. `PUT` acepta los lotes completos (con `id` para los existentes), `expectedVersion` y un motivo de 3 a 500 caracteres. Puede agregar, reordenar, corregir o quitar lotes. Recalcula consumos y márgenes; rechaza la corrección completa con `409` si deja entregas o reservas sin respaldo. La fecha de corte también puede corregirse; debe continuar siendo anterior a todas las operaciones y movimientos registrados. Cada corrección conserva el valor anterior, el nuevo y su motivo en el historial. La interfaz muestra el historial como información secundaria.

## Apariencia

`GET /api/theme` devuelve el color principal incluso antes de iniciar sesión para aplicarlo en la pantalla de acceso. Solo el administrador puede cambiarlo con `PUT /api/theme` y `{ "primaryColor": "#171717" }`. Se guarda en PostgreSQL y forma parte del respaldo CSV desde la versión 6. Se aceptan colores hexadecimales oscuros que mantengan el contraste de los textos blancos.

## Reportes

`GET /api/reports/overview`, `GET /api/reports/results`, `GET /api/reports/top-products` y `GET /api/reports/top-categories` son consultas disponibles para administrador y empleados. No incluyen deudas independientes ni usan fechas o importes de pagos para reconocer resultados.

`/overview` devuelve el valor acumulado de cabello recibido, ingresos de entregas, costo del cabello vendido, margen bruto, valor del stock al costo y número de ventas con al menos una entrega. `/top-products` devuelve los tipos más vendidos con peso, ingresos, costo, margen y stock físico; `/top-categories` agrupa las ventas por calidad. Ambas listas admiten `limit` entre 1 y 20; el valor predeterminado es 5.

La apertura cuenta en el valor del stock y en el costo de las ventas que la consumen. No cuenta como compra recibida en `overview` ni en los resultados periódicos.

`/results` admite `period=days|weeks|months`, `asOf=AAAA-MM-DD` y `count`. Sin parámetros muestra los seis meses hasta el actual; `days` muestra 30 días y `weeks` 12 semanas. Las semanas empiezan el lunes. Cada fila devuelve inicio y fin exclusivo del periodo, compras recibidas, ingresos por entregas, costo y margen bruto. Los periodos sin movimientos figuran con cero. `asOf` no puede ser futuro y `count` tiene límites para evitar respuestas excesivas.

Los importes de recepciones y entregas parciales se calculan como diferencias entre el valor acumulado anterior y el nuevo de cada línea, redondeado a dos decimales. El costo de cada lote recibido se distribuye entre sus entregas de la misma forma. Así los centavos de las entregas más el valor restante del lote suman su valor de compra, incluso después de corregir fechas, pesos o precios. El margen bruto es ingresos por entregas menos costo del cabello entregado; no incluye otros gastos.

## Deudas independientes

`/api/debts` está disponible solo para el administrador. Las deudas registran movimientos de efectivo ajenos a compras y ventas, y no alteran inventario ni reportes de margen. `kind` es `RECEIVABLE` (por cobrar) o `PAYABLE` (por pagar). El estado se calcula al consultar: `PAID` si el saldo es cero, `OVERDUE` si pasó el vencimiento, `PARTIAL` si tiene abonos vigentes o `PENDING` en los demás casos.

| Ruta | Acción |
| --- | --- |
| `GET /api/debts` | Lista con importe, pagado, saldo y estado. |
| `GET /api/debts/{id}` | Detalle con abonos vigentes y anulados e historial de cambios. |
| `POST /api/debts` | Crea una deuda con `requestKey`, `party`, `phone`, `kind`, `total`, `openedOn`, `dueOn` y `notes`. |
| `PUT /api/debts/{id}` | Edita datos con `expectedVersion` y `reason`. |
| `POST /api/debts/{id}/payments` | Registra un abono con `requestKey`, `paidOn`, `amount` y `note`. |
| `PUT /api/debts/{id}/payments/{paymentId}` | Corrige un abono con `expectedVersion` y `reason`. |
| `POST /api/debts/{id}/payments/{paymentId}/void` | Anula un abono con `expectedVersion` y `reason`. |

Los importes admiten hasta dos decimales. La fecha del abono va desde el registro de la deuda hasta hoy. La suma de abonos vigentes nunca puede superar el total; al editar la deuda tampoco se puede reducir el total por debajo de lo ya pagado ni mover la fecha de registro después de cualquier abono histórico. Las claves `requestKey` hacen idempotentes las creaciones. Los cambios, correcciones y anulaciones conservan valor anterior, valor nuevo, usuario y motivo. Un abono anulado deja de contar en el saldo y sigue visible en el detalle.

## Respaldo integral

Las rutas `/api/backups/**` son exclusivas del administrador. `GET /api/backups/settings` devuelve `intervalDays`, `lastConfirmedAt`, `pendingExportAt`, `nextReminderAt` y `due`. `PUT /api/backups/settings` acepta `{ "intervalDays": 7 }`, entre 1 y 365. `POST /api/backups/export` descarga el CSV integral y deja pendiente la confirmación; `POST /api/backups/confirm` registra que el administrador comprobó que el archivo quedó guardado. El sistema no puede comprobar por sí mismo si el archivo sigue en la computadora.

La exportación toma una instantánea coherente de PostgreSQL. Usa UTF-8 con BOM, punto y coma y las columnas `Tipo de registro`, `Identificador`, `Datos completos JSON`. El manifiesto tiene versión 6, fecha, zona horaria y cantidad de filas de cada tabla. Incluye cuentas sin credenciales, catálogo, proveedores, apertura de inventario, operaciones, recepciones, entregas, pagos, lotes, asignaciones de costo, deudas, configuración, color principal e historiales. Excluye hashes de contraseña, metadatos de acceso y sesiones. La restauración también admite las versiones 3, 4 y 5 anteriores; los respaldos sin peso final de venta reciben el mismo valor que el peso de cabello y los respaldos sin color reciben el predeterminado. La versión 2 del archivo generado por el prototipo usa otra estructura y no se importa automáticamente.

### Restauración

El administrador prepara una restauración en cuatro pasos. Los archivos se envían como `multipart/form-data` en el campo `file` (máximo 50 MB):

1. `POST /api/backups/restore/preview`: recibe el CSV, valida formato, versión, recuentos, columnas, referencias y saldos mediante una importación de ensayo dentro de una transacción que se revierte. Devuelve `preparationId`, fecha de caducidad (dos horas), cantidades y advertencia. Los datos vigentes quedan intactos.
2. `POST /api/backups/restore/{preparationId}/pre-backup`: descarga una copia integral del estado actual. La preparación queda asociada a la huella de ese estado.
3. `POST /api/backups/restore/{preparationId}/confirm-pre-backup`: el administrador confirma que guardó la copia previa en su computadora.
4. `POST /api/backups/restore/{preparationId}`: envía otra vez el mismo archivo y el campo de formulario `confirmation=RESTAURAR`. Si el estado actual cambió desde la copia previa, rechaza la solicitud y exige repetir el proceso. Si coincide, bloquea las tablas del negocio y las reemplaza en una transacción. Un error revierte todo.

La restauración conserva las credenciales, la obligación vigente de cambiar contraseña y la versión de sesión de las cuentas con el mismo identificador. Una cuenta previamente desactivada continúa desactivada. Una cuenta nueva del archivo recibe una contraseña aleatoria desconocida: el administrador puede restablecer la de un empleado; si el administrador es nuevo, se recupera mediante el comando privado `recover`. No se cierran sesiones por la restauración; cada solicitud vuelve a comprobar la cuenta. Las restauraciones completadas quedan en `restore_event`, fuera de los datos de negocio exportados.

La vista previa y el reemplazo toman bloqueos exclusivos breves sobre las tablas del negocio; otras lecturas o escrituras pueden esperar mientras terminan. [PostgreSQL garantiza la reversión de `TRUNCATE` dentro de una transacción](https://www.postgresql.org/docs/18/sql-truncate.html). La Configuración de `/sistema` ya consume estos endpoints; las rutas de demostración siguen usando `DemoStore`.

## Qué sigue

La interfaz `/sistema` ya incluye Inicio, Inventario, Proveedores, Compras, Ventas, Reportes, Deudas, Empleados y Configuración conectados a PostgreSQL. Antes de sustituir las rutas de demostración, revisar los flujos completos con datos locales y ajustar los detalles de presentación que surjan.
