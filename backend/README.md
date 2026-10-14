# Backend: primera etapa

La API se inicia con Java 21, Spring Boot 4.1.1 y PostgreSQL 18.6. Esta etapa prepara las migraciones, la base de datos local, el almacén JDBC de sesiones y el comando privado para crear o recuperar al administrador. El inicio de sesión y las operaciones todavía no están implementados; por eso solo se expone `/actuator/health` y se niega el resto de rutas HTTP.

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

El volumen `cabello_postgres_local` conserva la base entre reinicios. Las migraciones Flyway crean las categorías y longitudes actuales, con cero operaciones y cero stock. El esquema de Spring Session queda preparado para la etapa de autenticación.

## Crear el primer administrador

Con la base de datos en marcha, reconstruye la API después de incorporar el código de cuentas:

```bash
docker compose --env-file .env.local -f compose.local.yaml up --build -d
```

Después, ejecuta en una **terminal interactiva**:

```bash
docker compose --env-file .env.local -f compose.local.yaml run --rm --no-deps api --spring.main.web-application-type=none --app.admin-command=create
```

El comando pide el nombre de usuario y la contraseña dos veces; al teclear la contraseña no se muestran caracteres. No pongas la contraseña en argumentos, variables de entorno ni archivos. El nombre de usuario admite letras, números, puntos, guiones y guiones bajos, sin espacios. La contraseña requiere al menos ocho caracteres. El comando falla si ya existe un administrador. Por ahora la cuenta queda creada en la base, pero el inicio de sesión se añadirá en la siguiente etapa.

Si se pierde el acceso, el operador con acceso privado al servidor podrá ejecutar el mismo comando cambiando `create` por `recover`. Esto permite elegir un nuevo usuario y contraseña y revoca las sesiones anteriores de esa cuenta. Es un procedimiento excepcional, no una función del panel ni un endpoint HTTP.

## Qué sigue

Implementar el inicio de sesión, las sesiones con expiración absoluta de siete días, la gestión de empleados y los permisos por rol. Después se incorporarán proveedores, compras, ventas, movimientos, inventario, reportes, deudas y respaldo/restauración según [las decisiones del proyecto](../docs/decisiones-backend.md).
