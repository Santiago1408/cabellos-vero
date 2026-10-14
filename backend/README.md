# Backend: desarrollo local

La API se inicia con Java 21, Spring Boot 4.1.1 y PostgreSQL 18.6. Ya incluye migraciones, sesiones persistidas, el comando privado del administrador, autenticación, gestión de empleados y catálogos de cabello. Las operaciones del negocio todavía no están implementadas; sus rutas HTTP siguen denegadas.

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

El frontend todavía utiliza el prototipo en memoria. Estos endpoints son la primera parte del backend y deben usarse desde el mismo origen que el frontend cuando se haga la integración:

1. `GET /api/auth/csrf` abre una sesión y devuelve `headerName` y `token`. El cliente conserva la cookie `SESSION` y envía el token en ese encabezado para cada solicitud que modifica datos.
2. `POST /api/auth/login` recibe JSON con `username` y `password`, más la cookie y el encabezado CSRF. Devuelve el identificador, nombre visible, rol y estado de cambio obligatorio. Al ingresar, cambia el identificador de sesión y descarta el token CSRF anterior; el cliente debe solicitar uno nuevo.
3. `GET /api/auth/me` devuelve la cuenta asociada a la sesión vigente. Para empleados incluye nombre visible, CI, fecha de nacimiento y celular, de solo lectura.
4. `POST /api/auth/logout` requiere el token CSRF actualizado y cierra la sesión.
5. `POST /api/auth/password` requiere la sesión y el token CSRF actualizado. Recibe `currentPassword` y `newPassword` (mínimo ocho caracteres), mantiene la sesión actual y cierra las demás. El historial registra el evento sin guardar contraseñas ni hashes.

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

## Qué sigue

Incorporar proveedores, compras, ventas, movimientos, inventario, reportes, deudas y respaldo/restauración según [las decisiones del proyecto](../docs/decisiones-backend.md). Al integrar esas rutas se aplicarán también los permisos de consulta de empleados por sección. El frontend aún utiliza `DemoStore` y no consume estos endpoints.
