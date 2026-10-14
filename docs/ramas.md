# Cómo trabajar con ramas en este repositorio

`main` contiene la última versión aprobada. Cada cambio se prepara en una rama corta creada desde `main`, por ejemplo `feat/inicio-backend` para esta etapa, `feat/login` para autenticación o `fix/edicion-ventas` para una corrección. No hace falta mantener una rama `develop` permanente para un proyecto pequeño con una sola sede.

## Flujo habitual

1. Antes de empezar una tarea nueva, actualizar `main` y crear una rama:

   ```bash
   git switch main
   git pull --ff-only origin main
   git switch -c feat/nombre-del-cambio
   ```

2. Trabajar y guardar cambios en esa rama. Un commit debe describir una unidad revisable. Subir la rama privada para revisarla en GitHub:

   ```bash
   git add .
   git commit -m "Agregar inicio de sesión"
   git push -u origin feat/nombre-del-cambio
   ```

3. Abrir un *pull request* hacia `main`, revisar el código y sus comprobaciones, y aprobar el resultado. Solo entonces fusionar. Una vez configurado el despliegue automático, **fusionar en `main` publicará la versión en producción**; por eso la aprobación debe ocurrir antes de fusionar.

4. Para volver a trabajar desde la versión aprobada:

   ```bash
   git switch main
   git pull --ff-only origin main
   git branch -d feat/nombre-del-cambio
   ```

La rama `feat/inicio-backend` se creó localmente para los cambios actuales. Aún no se hizo commit, push ni fusión. En GitHub Free con repositorio privado, [las protecciones de rama](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches) y [las aprobaciones de despliegue](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments) no se pueden imponer técnicamente; este flujo depende de que nadie haga push directo a `main` y de revisar cada cambio antes de fusionarlo. Si más adelante se necesita bloquear esos atajos desde GitHub, habrá que evaluar un plan compatible.
