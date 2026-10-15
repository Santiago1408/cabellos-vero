# Apertura de inventario para el stock anterior al sistema

## Situación actual

La versión conectada a PostgreSQL todavía no permite ingresar stock de apertura. Cada lote de la base de datos exige una recepción de compra, y las consultas de inventario y reportes parten de esa relación. Cargar el stock antiguo como una compra crearía un proveedor, un costo de compra del periodo y posiblemente un saldo por pagar que no existieron. Antes de desplegar para el cliente se implementará una apertura específica.

## Datos que se acordarán con el cliente

1. **Fecha y hora de corte únicas.** Se elige el momento a partir del cual todas las entradas y salidas se registrarán en el sistema. El recuento físico debe corresponder a ese momento; no se registrarán compras ni ventas reales entre el recuento y la apertura sin conciliarlas.
2. **Recuento por tipo.** Para cada categoría y longitud se anotan gramos físicos con dos decimales. No se incluyen compras aún no recibidas ni cabello ya entregado a clientes.
3. **Costo por gramo.** Se anota el costo conocido o una estimación en bolivianos con dos decimales y se marca cuál de los dos es. El costo sirve para valorar el stock y calcular el margen bruto cuando se venda.
4. **Partidas distinguibles.** Si el cliente conoce varios lotes de un mismo tipo con distinta antigüedad o costo, se registran por separado. Se anota su fecha de origen cuando se conozca; si solo se conoce el orden, se deja establecido cuál es más antiguo. Si no se distingue ninguna partida, se registra un lote por tipo.

Una planilla de toma de datos puede usar las columnas: categoría, longitud en cm, lote u orden de antigüedad, peso en g, costo por g en Bs, costo conocido o estimado, fecha de origen conocida y observación. El sistema calculará el valor de cada lote y el total para revisar la carga antes de confirmarla.

## Flujo previsto en producción

1. Crear el administrador y comprobar que el catálogo coincide con los tipos físicos del cliente.
2. El administrador entra a **Inventario → Apertura de inventario**, fija la fecha y hora de corte, y carga las partidas contadas.
3. Revisa el resumen por tipo, el peso total y el valor calculado. Confirma la apertura y conserva una copia del recuento acordado.
4. Comprueba que Inventario muestra el peso físico contado y que el detalle identifica cada lote como «Apertura de inventario».
5. Registra desde entonces compras, recepciones, ventas y entregas normales.

Los lotes de apertura se usan antes que los lotes de compras posteriores, respetando la antigüedad conocida entre ellos. Una venta consume su costo por gramo para calcular el margen bruto. La apertura no aparece como compra ni genera pagos, deudas o proveedores. El respaldo integral CSV deberá contener la apertura y todos sus lotes para poder restaurar el mismo stock y los mismos márgenes.

Una corrección posterior del peso, costo u orden de un lote requerirá motivo e historial. El sistema recalculará las asignaciones y márgenes afectados y rechazará la corrección si deja una venta sin stock físico en su fecha real.

## Orden de implementación pendiente

Antes del despliegue con datos reales hay que ampliar la migración de base de datos, la lógica de lotes y ventas, las consultas de Inventario e Inicio/Reportes, la exportación/restauración CSV y la interfaz de administrador. La base de pruebas aislada permite desarrollar y revisar ese flujo sin alterar los datos locales de desarrollo.
