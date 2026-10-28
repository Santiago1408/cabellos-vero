# Demostración en VPS y posterior inicio con datos reales

Esta guía prepara la aplicación **conectada a Java y PostgreSQL** para una reunión con datos ficticios persistentes. La base de demostración tendrá un volumen propio. La instalación definitiva tendrá otro proyecto y otra base, creados después de aprobar las correcciones.

## 1. Estado del repositorio

La rama `feat/demo-despliegue` contiene la entrada conectada en `/sistema`, la configuración `compose.deploy.yaml`, Angular servido por Caddy y `scripts/cargar_demo.py` para una base vacía. El archivo `docs/prompt-migracion-node.md` pertenece a una tarea anterior y sigue sin commit hasta que se decida incluirlo. Antes de llevar código al VPS, revisar cambios, compilar e incorporar los aprobados a `main` o desplegar un commit identificado de esta rama. No asumir que los archivos locales no confirmados llegarán por `git clone`.

La configuración actual de desarrollo (`backend/compose.local.yaml`) y de pruebas (`backend/compose.test.yaml`) no publica la web con HTTPS. El despliegue usa `compose.deploy.yaml` desde la raíz del repositorio.

## 2. Confirmar la entrega y preparar la demostración

1. En el [área de cliente de OVHcloud](https://www.ovh.com/manager/), abrir el menú del nombre de usuario y consultar **Mis pedidos**. Si el VPS sigue en «Validación» o «Entrega en curso», esperar a «Entregado» antes de intentar SSH. OVH envía las credenciales al correo de entrega. Revisar también spam y los [mensajes de la cuenta](https://docs.ovhcloud.com/es/guides/account-and-service-management/managing-billing-payments-and-services/best-practices).
2. Recorrer localmente `/sistema` con administrador y empleado. Confirmar que la pantalla de acceso y la navegación conectadas son las que se mostrarán al cliente.
3. Preparar un nombre público. Un subdominio gratuito de [DuckDNS](https://www.duckdns.org/) es suficiente para esta demostración. Registrar el nombre elegido; tras recibir la IP pública del VPS, apuntarlo a esa IP.
4. Conservar acceso al repositorio privado en GitHub desde el VPS mediante una clave de despliegue de solo lectura u otro método seguro de clonación. No pegar un token o contraseña en comandos que queden en el historial.
5. Reservar un momento para la carga de datos y otro para ensayar la presentación desde una conexión distinta a la del VPS.

## 3. Preparar el servidor

Tras recibir el VPS con Ubuntu 24.04:

1. Copiar la IPv4 desde **Bare Metal Cloud → Servidores privados virtuales → tu VPS**. El correo de entrega indica el usuario y cómo obtener la contraseña temporal. Para Ubuntu suele ser `ubuntu`. Desde la computadora local, ejecutar `ssh ubuntu@IP_DEL_VPS` (usar el usuario exacto del correo si es distinto). Al primer ingreso, OVH puede pedir cambiar la contraseña y cerrar la sesión; volver a conectar con la nueva. Ya dentro, comprobar `whoami` y `cat /etc/os-release`.
2. Actualizar el sistema. Configurar acceso mediante clave SSH antes de modificar las opciones de acceso remoto.
3. Configurar el firewall para SSH, HTTP (80) y HTTPS (443). Comprobar que una segunda conexión SSH funciona antes de cerrar la primera.
4. Instalar Docker Engine y el complemento Docker Compose desde las instrucciones oficiales para la versión de Ubuntu elegida.
5. Verificar `sudo docker version` y `sudo docker compose version` en **el VPS**. Que Docker funcione en la computadora local no implica que esté instalado en el servidor.

OVHcloud documenta los [primeros pasos](https://docs.ovhcloud.com/es/guides/bare-metal-cloud/virtual-private-servers/starting-with-a-vps) y la [protección básica del VPS](https://docs.ovhcloud.com/es/guides/bare-metal-cloud/virtual-private-servers/secure-your-vps). Ajustar comandos de firewall/SSH al sistema efectivamente instalado; no copiar instrucciones de otra versión a ciegas.

## 4. Subir la aplicación de demostración

Clonar en el VPS el commit aprobado del repositorio privado. Trabajar desde la **raíz** del proyecto. Crear el archivo privado de variables a partir del ejemplo:

```bash
cp .env.deploy.example .env.deploy
chmod 600 .env.deploy
```

Editar `.env.deploy` con estos cinco datos: `SITE_DOMAIN` (el subdominio ya apuntado al VPS), `DB_NAME=cabello_demo`, `DB_USER=cabello_demo`, una `DB_PASSWORD` aleatoria y exclusiva de esta base, y `SESSION_COOKIE_NAME=CABELLO_DEMO_SESSION`. No subir `.env.deploy` a Git ni compartir su contenido. El archivo de ejemplo contiene solo marcadores.

Validar la configuración sin iniciarla:

```bash
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml config -q
```

Para moderar el pico de memoria en un VPS pequeño, construir las imágenes una tras otra y luego iniciar el proyecto:

```bash
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml build api
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml build web
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml up -d
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml ps
```

`database` y `api` no publican puertos en internet. Solo `web` publica 80 y 443; sirve Angular y dirige `/api/**` a Spring Boot. Caddy obtiene HTTPS cuando el nombre resuelve a la IP del servidor y esos puertos son accesibles. [Condiciones para HTTPS automático en Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy).

Si aparece un error al primer intento, revisar `ps` y los logs **sin compartir contraseñas**:

```bash
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml logs --tail=80 api
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml logs --tail=80 web
```

Esperar a que Flyway y Spring terminen de iniciar. Comprobar desde el navegador `https://TU_SUBDOMINIO/sistema`. La URL `https://TU_SUBDOMINIO/` presenta la landing pública provisional y su enlace «Acceso al sistema» lleva a `/sistema`. El contacto, las redes y la identidad visual definitiva se completarán después de que el cliente revise la propuesta. Los archivos de la antigua demostración pueden permanecer en el repositorio, pero no están enlazados desde las rutas publicadas.

### Caddy compartido con XPANDER

El Caddy del servicio `web` también publica la tienda XPANDER (`xpandertienda.duckdns.org`, otro proyecto en este VPS). Llega a sus contenedores `xpander-web` y `xpander-api` por la red externa `xpander_edge`, en la que no están la base ni la API de Cabello. Esa red debe existir antes de levantar Cabello; se crea una sola vez:

```sh
sudo docker network create xpander_edge
```

Si XPANDER está detenido, solo su dominio responde con error; Cabello no se ve afectado.

## 5. Crear el administrador de la demostración

Con la base y la API funcionando, ejecutar en una terminal SSH **interactiva**:

```bash
sudo docker compose -p cabello_demo --env-file .env.deploy -f compose.deploy.yaml run --rm --no-deps api --spring.main.web-application-type=none --app.admin-command=create
```

Elegir un usuario y contraseña exclusivos para la demostración; el programa pide la contraseña sin mostrarla. No colocarla en argumentos del comando. Con ella, entrar por la URL HTTPS y comprobar que Inventario, Compras y Ventas abren sin errores.

Si ya existe un administrador en la base, `create` rechazará la operación. El comando privado `recover` sirve para recuperar esa cuenta cuando corresponda; no ejecutarlo como forma normal de cambiar de usuario durante una sesión de demostración.

## 6. Cargar los datos ficticios

En la computadora local, desde la raíz del mismo repositorio, ejecutar:

```bash
python3 scripts/cargar_demo.py --url https://TU_SUBDOMINIO
```

El script pide el usuario y contraseña del administrador, verifica que sea administrador, que existan las categorías/longitudes necesarias y que no haya proveedores, operaciones, deudas ni apertura. Muestra el destino y exige escribir una frase con su nombre antes de modificar datos. La conexión remota requiere HTTPS y verifica el certificado normalmente.

La muestra crea:

- Apertura con tres lotes ficticios de Normal 38 cm, Premium 60 cm y Choco 40 cm, con costos estimados.
- Dos proveedores ficticios.
- Dos compras confirmadas con varias líneas, una compra pendiente y un pago parcial.
- Dos ventas entregadas con varias líneas, una reserva que acepta cabello pendiente y un cobro parcial.
- Una deuda independiente y un abono.

Nombres y teléfonos se identifican como datos de demostración. Las fechas se calculan con `America/La_Paz` y se distribuyen entre meses distintos, antes del día de la carga, para que Reportes e Inventario tengan movimientos coherentes.

El script **solo se usa una vez sobre una base vacía**. Si falla a mitad, indica dónde se detuvo; conserva lo ya escrito y no debe repetirse sobre esa misma base. Revisar la causa y completar manualmente o crear otra base aislada con ayuda antes de volver a cargar. Nunca dirigirlo a la instalación con stock real.

## 7. Ensayo previo a la reunión

1. Entrar por HTTPS desde una computadora y un teléfono, también con datos móviles. Revisar tamaños, desplazamiento y modales.
2. Abrir los detalles de apertura, inventario, compra y venta. Confirmar entradas y salidas, importes y estados.
3. Ver en Reportes los resultados de los movimientos y en Deudas el abono independiente.
4. Cerrar sesión y volver a entrar. Reiniciar **solo la API** y comprobar que la información sigue en PostgreSQL.
5. Descargar un respaldo integral CSV desde Configuración y guardarlo en la computadora. Ensayar restauraciones solo en otra base aislada.
6. Tener preparada una secuencia breve: Inicio → Inventario → Compra pendiente → Venta reservada → Venta entregada → Reportes → Deudas. Mostrar los formularios de creación si el cliente quiere verlos; usar los registros ficticios para no improvisar cantidades.

Los problemas visuales que se descubran durante este ensayo se corrigen en la rama, se recompila y se publica un commit identificado. Evitar desplegar cambios nuevos durante la reunión.

## 8. Después de la reunión: instalación real

Registrar las correcciones solicitadas, aplicarlas y revisarlas antes de cargar datos del cliente. La instalación real necesita **otra base y otro volumen**. Compose separa instalaciones por nombre de proyecto: [documentación de Docker](https://docs.docker.com/compose/how-tos/project-name/).

Cuando corresponda, detener la demostración con `docker compose ... down` **sin `-v`** para conservar su volumen. Preparar otro archivo privado `.env.production` con `DB_NAME`, `DB_USER`, `DB_PASSWORD` y `SESSION_COOKIE_NAME` propios. Iniciar el mismo Compose con `-p cabello_prod`, crear un administrador nuevo con el comando privado y registrar la apertura **real** junto al cliente. La apertura usará cantidades y costos estimados acordados en la fecha/hora de corte. Comprobar los totales antes de confirmar y descargar el primer respaldo CSV integral.

No restaurar un CSV de la demostración ni copiar su volumen a producción. Si se desea conservar la demo para seguir revisando, su volumen permanece separado; puede volver a arrancarse después bajo otra dirección/puertos compatibles. No ejecutar `down -v` ni borrar un volumen hasta identificarlo y contar con el respaldo que corresponda.
