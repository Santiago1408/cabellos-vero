# Revisión de La Magia del Cabello

Fecha: 30 de septiembre de 2026.

## Alcance y método

Se revisaron las rutas, componentes, formularios, modelos, cálculos de stock, reservas, deudas, indicadores y configuración. Se compiló la aplicación para producción y se ejecutaron 13 escenarios sobre el código real en instancias independientes del estado en memoria. También se inspeccionó la aplicación en una pestaña independiente del navegador, especialmente la selección de cabellos y el manejo de los modales con teclado.

La compilación terminó correctamente. Esto confirma que el proyecto puede construirse; las reproducciones descritas abajo muestran problemas de negocio que la compilación no detecta. Los escenarios de prueba se ejecutaron fuera del código del proyecto y no modificaron los registros de la pestaña del usuario.

Esta revisión propone cambios; no aplica correcciones al funcionamiento de la aplicación.

Se mantienen como decisiones válidas de la etapa actual:

- Estado en memoria que se reinicia al recargar, autorizado expresamente por el usuario.
- Roles y acceso de demostración, sin autenticación de servidor.
- Compras y ventas con los estados Pendiente y Confirmado.
- Inventario de solo lectura, cuyo stock cambia por compras y ventas.
- Combinaciones nuevas visibles en Inventario después de una compra confirmada.
- Detalle con el peso y precio originales de las compras, sin repartir las ventas entre proveedores.

La falta de una base de datos o de un acceso real no se clasifica como error del prototipo. Será trabajo necesario si posteriormente se autoriza el uso con datos reales.

## Cómo está organizado y cómo lo usaría el negocio

La aplicación usa Angular, componentes independientes, rutas cargadas bajo demanda y señales para actualizar la pantalla. `DemoStore` contiene datos iniciales, catálogos, reglas de stock y operaciones sobre todos los registros. Las páginas añaden validaciones, filtros y estados de sus formularios.

| Sección | Uso actual | Principal observación |
| --- | --- | --- |
| Compras | Proveedor, fecha, varios cabellos, peso, precio variable y confirmación | Faltan combinaciones configuradas en el selector; no hay relación con pagos |
| Ventas | Cliente, varios cabellos, venta confirmada o reserva | La comprobación de stock puede omitir líneas; el costo no sigue las compras |
| Inventario | Stock físico y apartados de movimientos pendientes | No puede explicar completamente el origen del saldo inicial; comparte catálogos con otras pantallas de forma desigual |
| Detalle de cabello | Compras confirmadas con proveedor, fecha e importes | Faltan salidas y totales para conciliar visualmente el saldo |
| Proveedores | Contactos, dirección, mapa, detalle y edición | Las compras vinculan al proveedor por nombre, aunque existe un identificador |
| Deudas | Saldos, edición y registro de pagos | Deudas independientes de compras y ventas; los pagos no tienen historial |
| Inicio y reportes | Indicadores, gráficos y productos destacados | Mezclan cálculos sobre registros con cifras fijas de demostración |
| Acceso y configuración | Nombre visible y cambio de rol para presentar la demo | No representan cuentas reales ni control de permisos |

El recorrido esperado sería: registrar al proveedor, comprar cabello, recibirlo y confirmar la compra, consultar stock, vender o reservar y finalmente cobrar/pagar. El sistema cubre las acciones principales sobre el peso, pero los últimos pasos financieros y la relación entre reservas y compras no están conectados.

## Fallas comprobadas

### 1. Una venta de varios cabellos puede reservar cantidades sin respaldo

**Prioridad alta.** La comprobación de una venta devuelve inmediatamente «necesita stock pendiente» al encontrar la primera línea que lo requiere. En ese momento deja de revisar las líneas restantes.

Reproducción:

1. Cabello A: 100 g físicos y una compra pendiente de 100 g.
2. Cabello B: 0 g físicos y ninguna compra pendiente.
3. Venta: 150 g de A y 500 g de B.
4. El sistema pregunta si se desea usar stock pendiente por A.
5. Al aceptar, guarda también la reserva de 500 g de B, que no tiene respaldo.

Además, esta reserva inválida bloquea la confirmación de la compra de A: la edición/confirmación de compras revisa todos los productos y encuentra la reserva imposible de B.

**Solución recomendada:** comprobar todas las líneas antes de guardar. Una falta absoluta de stock debe impedir la operación completa; solo después se debe preguntar por las líneas que sí pueden cubrirse con compras pendientes. Mostrar en la pregunta los tipos y pesos que dependen de esas compras. La misma comprobación debe servir para crear, editar y confirmar.

Referencia: [validación de ventas](/home/josue/Documents/cabello/src/app/data/demo-store.ts:258).

### 2. No se pueden comprar ciertas combinaciones de categoría y longitud ya definidas

**Prioridad alta.** El catálogo define 5 categorías y 10 longitudes, pero el estado inicial solo contiene 12 combinaciones. El formulario de compra obtiene las longitudes de esas combinaciones existentes, no del catálogo de longitudes.

Por ejemplo, hay una longitud de 70 cm configurada, pero para Tinturado solo aparecen 45 y 60 cm. Tampoco se puede agregar 70 cm desde Gestionar tipos porque el sistema responde «Esa longitud ya existe». La creación manual de cabello ya fue retirada, por lo que el usuario no tiene cómo registrar Tinturado de 70 cm.

**Opciones:**

- **Recomendada:** mostrar las longitudes del catálogo al comprar y crear internamente la combinación cuando se registra su primera compra. Mantenerla oculta de la tabla de stock hasta que la compra se confirme.
- Crear internamente todas las combinaciones de los catálogos existentes, conservando el filtro de visibilidad del Inventario.

Referencia: [longitudes del formulario](/home/josue/Documents/cabello/src/app/pages/orders/orders.ts:72), [combinaciones iniciales](/home/josue/Documents/cabello/src/app/data/demo-store.ts:35).

### 3. Los costos y ganancias no siguen el precio variable de las compras

**Prioridad alta.** Las compras registran correctamente su precio por gramo, pero no actualizan el costo almacenado en el tipo de cabello. Las ventas toman su costo de ese valor fijo. Para un tipo nuevo, el valor es cero.

Reproducción: se agregó Ondulado de 70 cm, se compraron 400 g a Bs. 13/g y se vendieron 100 g a Bs. 20/g. Los ingresos fueron Bs. 2.000. El sistema calculó costo cero y ganancia Bs. 2.000. En este ejemplo, sin otros lotes ni gastos, el costo del cabello vendido era Bs. 1.300 y el margen Bs. 700.

También queda mal la valoración del cabello que sigue en stock, porque Reportes multiplica el peso por el costo fijo del tipo.

**Opciones que requieren elegir una regla de negocio:**

- **Promedio ponderado:** calcular el costo considerando el peso y precio de las entradas. Es una opción sencilla cuando se mezcla cabello de la misma categoría y longitud.
- **Lotes por compra:** mantener cantidades restantes por lote y descontar primero el más antiguo, o permitir seleccionar lotes. Da mayor detalle, pero exige más información y manejo.

Conviene mostrar «Margen bruto» cuando solo se resta el costo del cabello; transporte y otros gastos no están registrados para calcular una ganancia neta.

Referencia: [costo usado al vender](/home/josue/Documents/cabello/src/app/pages/sales/sales.ts:117), [entrada de stock](/home/josue/Documents/cabello/src/app/data/demo-store.ts:274), [valoración del inventario](/home/josue/Documents/cabello/src/app/pages/reports/reports.ts:13).

### 4. Los reportes mezclan cifras que no se pueden conciliar

**Prioridad alta para presentar resultados confiables.** Los indicadores de ingresos se calculan sobre ventas confirmadas, pero los gráficos mensuales vienen de una lista fija. El gráfico circular de compras tiene proporciones fijas en CSS. La etiqueta «Últimos 30 días» tampoco aplica un filtro por fechas.

Con los datos iniciales:

- Ingresos de ventas confirmadas: **Bs. 17.624**.
- Ventas de septiembre en el gráfico fijo: **Bs. 35.850**.
- Peso vendido acumulado en los productos: **14.800 g**.
- Peso de las ventas confirmadas registradas: **2.700 g**.

La tabla «Valor de ventas» usa peso vendido multiplicado por un precio fijo del tipo, aunque cada venta tiene su propio precio.

Los gráficos ilustrativos están contemplados en el README, pero su mezcla con cifras que cambian puede hacer que un usuario interprete como real un resultado de demostración.

**Solución recomendada:** construir indicadores, rankings y gráficos desde las mismas operaciones, con un período seleccionable y criterio explícito para incluir solo confirmadas. Separar cualquier saldo/histórico inicial de los movimientos de ese período. Como medida temporal, marcar cada gráfico fijo como ilustrativo.

Referencia: [series fijas](/home/josue/Documents/cabello/src/app/data/demo-store.ts:90), [indicadores y meses](/home/josue/Documents/cabello/src/app/pages/dashboard/dashboard.ts:14), [valor de ventas](/home/josue/Documents/cabello/src/app/pages/reports/reports.html:143), [gráfico circular](/home/josue/Documents/cabello/src/app/pages/dashboard/dashboard.css:163).

### 5. Agregar categorías dispara alertas para cabello que nunca se ha comprado

**Prioridad media.** Gestionar tipos crea combinaciones con peso cero y mínimo cero. Inicio y las notificaciones consideran que cero es menor o igual a ese mínimo y las cuentan como productos por reponer. La tabla de Inventario las mantiene ocultas porque no tienen compras.

Reproducción: agregar una categoría llevó el contador de stock bajo de **4 a 14**, aunque no hubo ninguna compra ni venta y la tabla de Inventario no mostró esas 10 combinaciones nuevas.

**Solución recomendada:** limitar alertas a tipos que ya se manejan en el negocio. El mínimo debe ser una configuración opcional por tipo; si no está definido, no generar una alerta de reposición. Esto configura una alerta, sin permitir editar el stock.

Referencia: [nuevas combinaciones](/home/josue/Documents/cabello/src/app/data/demo-store.ts:151), [contador de reposición](/home/josue/Documents/cabello/src/app/pages/dashboard/dashboard.ts:18).

### 6. Fechas y validaciones de deudas producen resultados inesperados

**Prioridad media.** Una nueva deuda empieza siempre con fecha **22/09/2026**, en vez de la fecha actual. Se permite guardar un vencimiento anterior al registro, y un campo Pagado vacío puede almacenarse como `null` pese a estar marcado como obligatorio.

El vencimiento se compara con la fecha UTC. A las 20:30 del 30 de septiembre en La Paz, UTC ya corresponde al 1 de octubre: una deuda que vence el 30 aparece vencida antes de terminar el día local. Los contadores calculados tampoco tienen una señal de cambio de día que fuerce su actualización.

**Solución recomendada:** usar la fecha local del negocio; actualizar cálculos al cambiar de día; definir si se admiten deudas vencidas ingresadas posteriormente; normalizar y validar números en el servicio, además del formulario. Un importe pagado vacío debería ser cero explícito o generar un error claro.

Referencia: [valores iniciales y validaciones](/home/josue/Documents/cabello/src/app/pages/debts/debts.ts:6), [vencimiento](/home/josue/Documents/cabello/src/app/data/demo-store.ts:306).

### 7. La presentación puede ocultar gramos y mostrar importes que no suman

**Prioridad media.** La conversión automática a kilos muestra como **1 kg** un peso de **1.004 g**, porque limita los kilos a dos decimales. El dato guardado sigue siendo correcto, pero un usuario que trabaja por gramos pierde información visible.

Además, no hay una regla explícita de redondeo de dinero. Dos líneas de Bs. 0,335 se muestran como Bs. 0,34 cada una; su total calculado antes de redondear se muestra como Bs. 0,67.

**Solución recomendada:** conservar gramos exactos en stock y detalles, o mostrar kilos junto al peso en gramos. Definir precisión permitida para gramos y precios y una regla uniforme para redondear líneas y total. Reutilizar ese cálculo en pantallas, deudas y CSV.

Referencia: [formatos y totales](/home/josue/Documents/cabello/src/app/data/demo-store.ts:290).

### 8. Los modales no aíslan correctamente la navegación con teclado

**Prioridad media.** En el modal de nueva compra se comprobó que Escape no lo cierra. Al navegar hacia atrás con Tab desde Cerrar, el foco pasa a un botón de edición de la tabla que está detrás del modal. Al abrirlo, el foco tampoco se mueve automáticamente a un campo del formulario.

Los formularios se cierran al hacer clic en el fondo; volver a abrirlos reinicia el borrador. No existe advertencia si se descartan datos sin guardar.

**Solución recomendada:** un componente compartido de modal con foco inicial, navegación confinada al diálogo, Escape y devolución del foco al botón que lo abrió. Advertir antes de descartar un formulario con cambios.

Referencia: [modal de compra](/home/josue/Documents/cabello/src/app/pages/orders/orders.html:54). El mismo patrón se repite en ventas, proveedores, deudas e inventario.

## Vacíos del flujo de negocio y opciones

### 9. La reserva no identifica qué compra pendiente la respalda

El sistema guarda el peso reservado por tipo de cabello, pero no relaciona una venta pendiente con una compra concreta ni registra cómo se reparte entre stock físico y cabello por recibir.

La disponibilidad aplica una regla implícita: con 100 g físicos, 100 g por recibir y una reserva de 90 g, sigue mostrando 100 g disponibles. Compensa primero la reserva con la compra pendiente. Esto puede ser válido si el negocio desea reservar entradas futuras, pero debe elegirse y mostrarse explícitamente.

**Opciones:**

- Apartar primero el stock físico y recurrir a entradas pendientes solo para la diferencia.
- Permitir elegir una compra pendiente para respaldar parte de la reserva, mostrando los gramos asignados y si ya se recibió.

Recomiendo mostrar en el detalle de una reserva «peso físico apartado», «peso por recibir» y «qué falta para confirmar». La confirmación final puede seguir siendo manual, como ya se solicitó.

Referencia: [disponibilidad](/home/josue/Documents/cabello/src/app/data/demo-store.ts:240), [modelo de venta](/home/josue/Documents/cabello/src/app/data/demo-store.ts:28).

### 10. Las compras/ventas no están conectadas con deudas y pagos

Confirmado indica que el movimiento afecta al stock. No registra si fue pagado. Una deuda se crea de forma independiente: puede omitirse, duplicarse o tener un importe distinto al de la operación.

**Opciones:**

- Añadir a la operación una condición de pago, importe abonado y vencimiento; crear la deuda asociada cuando haya saldo.
- Conservar la creación manual de deudas, pero permitir seleccionar y vincular una compra o venta, comprobando su saldo.

Recomiendo la primera para compras/ventas a crédito, manteniendo deudas manuales para conceptos externos. Debe definirse qué sucede al editar el importe de una operación que ya recibió pagos.

Referencia: [modelos de operación y deuda](/home/josue/Documents/cabello/src/app/data/demo-store.ts:27), [registro de pagos](/home/josue/Documents/cabello/src/app/pages/debts/debts.ts:34).

### 11. No existe un historial de abonos

Registrar pago solo incrementa el total Pagado. No guarda fecha, importe individual, método, referencia ni responsable. Editar una deuda permite cambiar directamente lo pagado, perdiendo cualquier explicación del ajuste.

**Solución propuesta:** registrar cada abono por separado y calcular el saldo a partir de ellos. Permitir consultar y corregir abonos mediante movimientos documentados. Esto facilita explicar al cliente/proveedor cómo se obtuvo el saldo.

### 12. No hay un camino para una compra que nunca llega o una reserva abandonada

Con los dos estados actuales, una operación pendiente solo puede confirmarse o editarse. Si el proveedor no entrega o el cliente desiste, no hay una acción que cierre la operación y libere la reserva conservando su historia.

Esto es una ampliación del alcance actual, que expresamente usa solo Pendiente y Confirmado.

**Opciones futuras:** acción de anulación con motivo y fecha; o un indicador de operación anulada separado del estado de entrega. Para una operación confirmada, el sistema debe validar y registrar la reversión del stock y sus efectos sobre pagos y reservas. Evitar el borrado sin rastro.

### 13. Las operaciones se reciben o entregan completas

Si una compra tiene dos tipos y llega solo uno, confirmar suma ambas líneas. Una venta con stock para algunas líneas y otras por recibir queda pendiente completa. No hay cantidades recibidas/entregadas por línea.

**Opciones:** mantener la operación completa como regla y dividirla manualmente en registros separados; o incorporar recepción/entrega parcial por línea. La segunda conviene si estas situaciones son frecuentes. Requiere definir cómo se muestran saldos pendientes y precios cuando el peso real recibido difiere del acordado.

### 14. El detalle de inventario no permite comprobar todo el saldo

El detalle muestra las compras y calcula el saldo inicial como stock actual menos compras más ventas. Ese saldo inicial no está guardado como un registro independiente: una alteración incorrecta del stock podría quedar absorbida automáticamente en él, sin detectar una diferencia.

Además, la pantalla no muestra las ventas ni sus cantidades totales, aunque su fórmula menciona esas salidas. Para el cliente, compras por 1.200 g y stock actual de 950 g necesitan una explicación visible de los 250 g vendidos.

**Solución recomendada:** conservar un saldo inicial explícito y documentado, y calcular/conciliar stock con entradas y salidas. Ampliar el detalle de solo lectura con ventas y totales, manteniendo la tabla de compras solicitada. Si se decide registrar mermas o devoluciones en el futuro, deben ser movimientos con motivo y fecha, sin convertir el inventario en una tabla editable.

Referencia: [saldo inicial derivado](/home/josue/Documents/cabello/src/app/pages/product-detail/product-detail.ts:26).

### 15. Falta diferenciar fechas y registrar el historial de cambios

Hay una fecha de operación y la fecha de última modificación. No hay fecha de creación separada, fecha de recepción/entrega ni versiones anteriores. Confirmar una compra actualiza «Última modificación», pero no conserva explícitamente cuándo se recibió el cabello. Una operación futura puede confirmarse hoy.

**Solución propuesta:** distinguir fecha de negocio, registro, confirmación y modificación; registrar qué se cambió, valor anterior/nuevo y motivo. Mantener en el detalle el mensaje de última modificación solicitado, añadiendo un historial consultable. Las reglas sobre fechas futuras y operaciones atrasadas requieren acordarse.

Referencia: [modelos](/home/josue/Documents/cabello/src/app/data/demo-store.ts:27), [confirmación de compra](/home/josue/Documents/cabello/src/app/data/demo-store.ts:210).

### 16. Proveedores y clientes no tienen la misma identidad estable en las operaciones

Las compras guardan el nombre del proveedor, aunque el proveedor tiene un ID. Al cambiarlo se reescriben las compras con ese nombre y se les asigna una nueva fecha de modificación. El teléfono de deudas existentes no se actualiza. Los clientes son texto libre, por lo que «Salón Renueva» y «Salon Renueva» se pueden tratar como personas diferentes.

**Opciones:** vincular operaciones por identificador y mantener el nombre original como dato histórico; para clientes, empezar con autocompletado o crear un catálogo sencillo con nombre y teléfono. Recomiendo que el detalle del contacto también permita consultar compras/ventas y saldos relacionados.

El campo teléfono del proveedor actualmente acepta cualquier texto no vacío. Se comprobó que se guarda `abc`. Conviene normalizar espacios y prefijos y comprobar que sea un número utilizable, conservando la flexibilidad para contactos internacionales.

También se comprobó que la validación de Google Maps acepta `https://google.example.com/maps`. El patrón permite cualquier terminación después de `google.`, aunque no sea un dominio de Google. Debe reemplazarse por una lista explícita de dominios admitidos y conservar los dominios exactos de enlaces cortos. Es una corrección de validación independiente del resto del modelo de contactos.

Referencia: [cambio de proveedor](/home/josue/Documents/cabello/src/app/data/demo-store.ts:162), [cliente como texto](/home/josue/Documents/cabello/src/app/pages/sales/sales.html:63).

### 17. Encontrar un registro se vuelve lento cuando crece la lista

Se retiró el buscador global conforme a lo solicitado. No se añadieron búsquedas locales: compras/ventas filtran por estado, proveedores no tiene filtro y no hay rangos de fechas. Las tablas de pendientes y de compras del detalle no tienen paginación.

**Solución propuesta:** búsqueda dentro de cada sección, filtros por proveedor/cliente y rango de fechas, y filtros por tipo de cabello para movimientos pendientes. No es necesario recuperar el buscador del marco. Un acceso de detalle debe permitir volver conservando filtros y página.

Dos operaciones del mismo proveedor/cliente y día tienen el mismo nombre visible. Se pueden distinguir añadiendo hora o una referencia opcional en el detalle, sin restablecer la columna de número de compra retirada.

## Estructura técnica y mantenimiento

1. **Separar responsabilidades progresivamente.** `DemoStore` combina datos ilustrativos, catálogo, stock, operaciones, contactos y deudas. Extraer reglas/cálculos de stock, pagos y reportes a módulos pequeños, manteniendo el estado en memoria. No hace falta incorporar un servidor para ordenar el código.
2. **Centralizar las validaciones.** Peso/precio y líneas repetidas se comprueban principalmente en páginas. El servicio acepta directamente operaciones sin validar todos esos datos; por ejemplo, ignora un producto inexistente al evaluar una venta. La protección debe existir donde se guarda la operación, además de las ayudas del formulario.
3. **Reducir fuentes duplicadas.** El producto guarda peso vendido, costo/precio fijos, proveedor y características antiguas; las operaciones ya contienen buena parte de esa información. Usar registros como origen de los indicadores y un saldo inicial explícito. Revisar color/calidad y proveedor único del producto según el nuevo modelo del negocio.
4. **Compartir componentes y cálculos.** Compras y ventas duplican buena parte de sus formularios y ordenación. Un editor de líneas y un modal compartido facilitarían corregir validaciones y accesibilidad en ambos lugares. Los totales deben usar la misma función con la misma política de redondeo.
5. **Añadir comprobaciones del negocio.** No se encontraron archivos de pruebas del proyecto. Priorizar ventas de varias líneas, reservas concurrentes en una misma sesión, confirmación repetida, edición de confirmadas, cambios de costo, redondeo y fechas locales. Activar progresivamente `strict` y `strictTemplates` para detectar valores vacíos e incompatibilidades.
6. **Ordenar documentación y restos del prototipo.** «Mi tienda» ya no tiene ruta, pero quedan sus archivos y campos. El título del navegador sigue siendo «Cabellos Vero · Inventario», incluso en Compras o Deudas. Aparecen marcas CV/MC y archivos CSV con el nombre anterior. El README menciona Tailwind y formularios de productos que no corresponden al funcionamiento actual.
7. **Preparar el crecimiento cuando sea necesario.** Los cálculos de pendientes recorren todas las operaciones para cada producto. Con pocos registros funciona; con muchos conviene calcular mapas de totales una sola vez. Si se habilita persistencia y varios usuarios, las operaciones de stock deberán validarse y guardarse de manera conjunta en el servidor.

## Resultados de las reproducciones

| Escenario | Resultado observado |
| --- | --- |
| Compra pendiente de 400 g, confirmación y venta de 100 g | Correcto: 0 g antes de recibir, 400 g después y 300 g tras vender |
| Tinturado de 70 cm | No seleccionable; agregar 70 cm responde que ya existe |
| Venta de dos cabellos, segunda línea sin respaldo | Se guardó una reserva de 500 g con 0 g físicos y 0 g por recibir |
| Confirmar compra tras esa reserva inválida | Bloqueada por la reserva del otro tipo |
| Reducir a peso físico una reserva antes de guardar | Conservó correctamente la elección Pendiente |
| Nuevo tipo comprado a Bs. 13/g y venta de 100 g a Bs. 20/g | Costo 0; margen mostrado Bs. 2.000 en vez de Bs. 700 para ese ejemplo |
| Agregar una categoría sin compras | Alertas de reposición pasaron de 4 a 14 |
| Comparar gráfico y ventas confirmadas iniciales | Bs. 35.850 en gráfico frente a Bs. 17.624 en operaciones |
| Deuda con Pagado vacío y vencimiento anterior al registro | Se guardó sin error; fecha inicial fija 22/09/2026 |
| Vencimiento el mismo día a las 20:30 de La Paz | Se marcó vencida al usar fecha UTC |
| Mostrar 1.004 g | Se presentó como 1 kg |
| Dos importes de Bs. 0,335 | Suma sin redondear Bs. 0,67; suma de líneas redondeadas Bs. 0,68 |
| Proveedor con teléfono `abc` y dirección `https://google.example.com/maps` | Se guardaron ambos valores sin error |

Las pruebas del código se realizaron con un programa temporal que transpila los módulos del proyecto y ejecuta sus clases y reglas reales, con estados independientes. No se ejecutó una batería completa de pruebas de interfaz en todas las resoluciones o dispositivos. La revisión de teclado y el selector de compras sí se comprobaron en el navegador.

## Orden sugerido para resolverlo

1. **Corregir bloqueos y datos imposibles:** validación completa de ventas, combinaciones de cabello y alertas de reposición.
2. **Acordar costos y reservas:** promedio ponderado o lotes; qué parte de una reserva ocupa stock físico y qué parte depende de compras pendientes.
3. **Hacer conciliables stock y reportes:** saldo inicial explícito, detalle de salidas, cálculos por período y precios reales de las operaciones.
4. **Conectar el dinero:** operaciones a crédito, deudas vinculadas e historial de abonos.
5. **Completar el trabajo diario:** búsqueda local, manejo de fechas, redondeo, modales y consultas por contacto.
6. **Evaluar ampliaciones:** anulación, recepciones parciales, devoluciones/mermas y, cuando se decida usarlo con información real, persistencia y acceso de usuarios.

Las correcciones de las tres primeras fallas comprobadas merecen prioridad sobre nuevas pantallas: afectan la posibilidad de registrar cabello, la validez de las reservas y la interpretación de los resultados del negocio.
