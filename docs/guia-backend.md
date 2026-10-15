# Ruta de desarrollo del backend

Esta guía parte de las [decisiones ya acordadas](decisiones-backend.md). El frontend actual es un prototipo en memoria; ninguna de sus cuentas o datos de demostración se migrará a producción. Las reglas del negocio se definirán una vez en el backend y el frontend consumirá la API.

## 1. Preparar el repositorio y el entorno local

1. Mantener el repositorio privado actual como monorepositorio: `src/` para Angular y `backend/` para Spring Boot. Abrir una rama por cambio; revisar resultados y aprobar su incorporación a `main` antes de que se publique. El procedimiento está en [ramas.md](ramas.md).
2. La primera etapa ya fija Java 21, Spring Boot 4.1.1 y PostgreSQL 18.6. El entorno local usa Docker Engine con Compose. Para compilar directamente fuera de Docker, instalar **JDK 21**, que incluye `javac`; la máquina actual solo tiene el entorno de ejecución Java 21. No instalar herramientas de desarrollo en el VPS de producción.
3. Levantar PostgreSQL local con Compose. Mantener usuario, contraseña y nombre de base en variables locales fuera de Git. Crear perfiles `local` y `prod`; ninguna credencial real debe quedar en código, imágenes ni CSV.
4. Crear el proyecto Spring Boot dentro de `backend/` con Web, Validation, Security, Spring Session JDBC, PostgreSQL, Flyway y Actuator. Definir el paquete raíz, configuración y esquema de errores de API. Los cambios de esquema se harán solo con migraciones Flyway.

## 2. Definir el modelo antes de reemplazar pantallas

1. Documentar en un esquema la identidad estable de categorías, longitudes, combinaciones de cabello, proveedores, cuentas y operaciones. Empezar con una sede sin tablas de sucursales; dejar identificadores estables y separar autenticación de datos comerciales para facilitar la expansión futura.
2. Modelar compra y venta como cabecera con varias líneas. Registrar fecha de operación, fecha y hora efectiva de cada recepción o entrega y momento en que se cargó al sistema, estado, cantidades acordadas, realizadas y pendientes, precios por gramo, anulaciones y motivo de toda edición. Una operación parcialmente ejecutada continúa **Pendiente**; cada movimiento físico se conserva.
3. Modelar lotes de cada recepción de compra y asignaciones de cada entrega de venta, consumiendo primero el lote más antiguo. Guardar por separado pagos, saldos, deudas externas, sus historiales y un registro de auditoría con usuario, momento y valores anteriores y nuevos. El nombre de cliente es texto; las compras referencian al proveedor por ID estable.
4. Representar gramos, precios e importes con `BigDecimal` y escala 2. Rechazar más de dos decimales. Redondear cada importe de línea a centavos con `HALF_UP` y sumar líneas ya redondeadas. Guardar momentos efectivos con zona horaria clara y mostrar la hora solo en detalles de transacción.

## 3. Implementar reglas y API por módulos

1. Catálogos y proveedores: altas, cambios, eliminación solo si no hay referencias, listas ordenables y validaciones. Cargar únicamente categorías y longitudes actuales; no migrar datos de demostración.
2. Inventario y operaciones: crear operaciones con varias líneas; verificar disponibilidad de **todas** antes de guardar una venta; reservar físico primero y compras pendientes después; pedir aceptación para usar cabello por recibir; rechazar toda la venta si alguna línea carece de respaldo, con faltantes por tipo. Registrar recepciones y entregas parciales con su fecha y hora reales, incluso si se ingresan después.
   Antes de usar el sistema con el cliente, implementar una apertura de inventario en la que el administrador registre, con una fecha y hora de corte únicas, peso y costo por gramo de cada lote físico existente. Conservar lotes separados cuando se conozcan costos o antigüedades diferentes; marcar los costos estimados. Esta apertura no crea compras, proveedores, pagos ni deudas. Sus lotes se consumen por antigüedad y se incluyen en inventario, márgenes, auditoría y respaldos.
3. Correcciones: exigir motivo; recalcular existencias, reservas, lotes y márgenes históricos; impedir valores negativos o que una corrección deje ventas anteriores sin stock en su momento. Mantener los movimientos y sus versiones anteriores. Permitir anular un movimiento registrado completamente por error si pasa las mismas validaciones. Anular solo el saldo no cumplido de una operación, sin revertir las cantidades ya movidas.
4. Finanzas: permitir anticipos, cobros, pagos y saldos por operación; corregir o anular pagos con motivo e historial; no permitir que el nuevo total sea menor que lo pagado vigente. Mantener Deudas separadas del negocio. Calcular reportes por movimientos efectivos en días, semanas y meses, con periodos sin movimientos en cero y margen bruto de ventas según costos de lotes.
5. Publicar contratos de API documentados, con paginación, ordenación y filtros validados del lado del servidor. Un error debe indicar qué línea, cantidad o regla falló. Usar transacciones de base de datos, bloqueos o control de versión e idempotencia para evitar reservas, entregas y pagos duplicados bajo peticiones simultáneas.

## 4. Cuentas, sesiones y permisos

1. Crear el primer administrador mediante un comando privado ejecutado en el VPS; el comando solicitará el usuario elegido y la contraseña por entrada oculta, guardará solo un hash robusto y fallará si ya existe un administrador salvo en modo explícito de recuperación. No exponer ese comando como ruta HTTP.
2. Autenticar con usuario y contraseña mediante Spring Security y sesiones persistidas en PostgreSQL con Spring Session JDBC. La sesión vence tras 24 horas sin actividad o 7 días desde el inicio. Usar cookie `Secure`, `HttpOnly` y `SameSite`; proteger solicitudes que escriben con CSRF y servir frontend y API bajo el mismo origen HTTPS.
3. Aplicar permisos en **cada endpoint**: administrador para cambios y secciones restringidas; empleado únicamente para consultas de Inventario, Compras, Ventas, Reportes y su perfil, con cambio de contraseña propia. Las claves temporales obligan a cambiar contraseña antes de usar el resto de la API. Desactivar o restablecer una cuenta revoca sus sesiones; cambiar contraseña propia mantiene la sesión actual y revoca las demás.
4. Configurar esperas progresivas frente a intentos fallidos, sin bloqueo permanente, y comprobar estado y permisos actuales de la cuenta en cada solicitud, incluso tras restaurar un respaldo.

## 5. Sustituir el estado en memoria del frontend

1. Crear servicios Angular para la API y tipos de respuestas; reemplazar `DemoStore` por módulos en orden: autenticación, catálogos, proveedores, compras, ventas, inventario, reportes, deudas, empleados y configuración.
2. Conservar las pantallas actuales donde expresen las reglas acordadas. Las operaciones parciales deben mostrar progreso, movimientos, pagos e historial. El frontend envía el motivo obligatorio y la fecha/hora efectiva; el servidor decide el estado, los saldos y las existencias.
3. Manejar cargas, errores detallados, sesión vencida y conflictos de edición. Evitar que dos clics creen movimientos o pagos duplicados.

## 6. Respaldo, restauración y aceptación local

1. Implementar exportación integral CSV versionada, descargada por el administrador a su computadora. Incluir datos originales suficientes para reconstruir relaciones, movimientos, costos, pagos, historiales, catálogos, configuración y usuarios sin contraseñas ni sesiones. Mantener un recordatorio configurable en días; con el intervalo inicial de siete días, conservar manualmente cuatro copias.
2. Implementar en Configuración un flujo de restauración: cargar y validar **todo** el archivo, vista previa con cantidades, advertencia de pérdida de cambios posteriores, descarga obligatoria de una copia del estado actual, confirmación explícita y reemplazo transaccional. Si la restauración falla, el estado previo queda intacto. Conservar las credenciales actuales de cuentas coincidentes y evitar reactivar una cuenta desactivada.
3. Antes del despliegue, comprobar localmente las reglas de precisión, movimientos parciales, concurrencia, asignación de lotes, correcciones retroactivas, permisos, expiración de sesiones y restauración real desde una copia CSV. Comparar reportes e inventario contra casos de ejemplo revisados con el administrador.

## 7. Preparar y publicar producción

1. Registrar un subdominio gratuito y apuntarlo al VPS. Comprar el OVHcloud VPS-1 cuando el backend y el flujo de despliegue local estén listos; la guía de compra y configuración se hará con las pantallas y condiciones vigentes en ese momento.
2. Configurar acceso SSH con clave, actualizaciones, firewall, Docker Compose y copias de la configuración fuera del repositorio. Crear servicios separados de proxy HTTPS, frontend, backend y PostgreSQL en el mismo VPS. Exponer públicamente solo HTTP/HTTPS; base de datos y API interna quedan en la red de Compose. El proxy servirá Angular y `/api` bajo el mismo origen.
3. Guardar secretos de producción solo en el VPS o en el gestor apropiado del flujo de despliegue. Configurar HTTPS automático y comprobar renovación. Crear el administrador con el comando privado; cargar el catálogo y registrar la apertura de inventario antes de la primera compra o venta real.
4. Ejecutar comprobaciones de frontend y backend sobre cada cambio propuesto. Revisar y aprobar antes de integrar en `main`; el push a `main` desencadena despliegue automático con migraciones, comprobación de salud y opción de volver a la versión anterior. En GitHub Free con repositorio privado, esta aprobación previa depende del proceso del equipo porque las protecciones de rama exigibles requieren revisar el plan de GitHub.
5. Hacer una prueba completa de compra, recepción parcial, venta reservada, entrega, pago, reporte, exportación, restauración y recuperación del administrador. Anotar el procedimiento operativo y quién conserva los cuatro CSV.

## Datos que se decidirán al ejecutar estas etapas

- Nombre concreto del subdominio gratuito y ubicación de la computadora donde se conservarán los CSV.
- Nombre de usuario del primer administrador, que se introducirá en el comando privado.
- Versiones a usar en producción tras revisar actualizaciones y compatibilidad cuando se acerque el despliegue.

Estas elecciones no cambian las reglas de negocio ya acordadas. Si surge una decisión nueva sobre la lógica, se planteará en un lote de preguntas antes de codificarla.
