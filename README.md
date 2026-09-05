# Consulta de sectores CESFAM

Aplicación web local para consultar a qué sector CESFAM pertenece una calle.

## Ver la aplicación

1. Instala [Node.js](https://nodejs.org/) 18 o superior.
2. En una terminal, desde la carpeta del proyecto, ejecuta:

   ```bash
   npm start
   ```

3. Abre **http://localhost:3000** en tu navegador.
4. Escribe una calle y selecciona **Consultar**. La búsqueda no distingue entre mayúsculas/minúsculas ni tildes.

Puedes probar con estas tres calles:

| Calle | Resultado esperado |
| --- | --- |
| `Los Coigües` | Sector Amarillo |
| `Millahuin` | Sector Azul |
| `Ámbar` | Sector Verde |

Para calles que la planilla divide según numeración, escribe también el tramo completo, por ejemplo: `Andrés Bello, menor de 800`.

## Ejecutar las pruebas automáticas

```bash
npm test
```

## Regenerar la base desde la planilla Excel

La base usada por la interfaz es `data/sectores.json`. Para reconstruirla desde `Sectores Cesfam nuevo.xlsx`, ejecuta:

```bash
npm run convert:sectors
```

El conversor utiliza únicamente Python 3 y las bibliotecas estándar.

## Publicar en GitHub Pages

El repositorio incluye un flujo de despliegue automático. Para publicarlo:

1. Sube estos cambios a la rama `main` de GitHub.
2. En GitHub, abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **GitHub Actions** como fuente.
4. Abre la pestaña **Actions** y espera que termine el flujo **Deploy CESFAM lookup to GitHub Pages**.
5. GitHub mostrará la URL pública. En este repositorio normalmente será `https://valdivix-coder.github.io/CESFAM/`.

Desde ese momento, cada cambio enviado a `main` actualiza la aplicación automáticamente. El flujo prepara una versión estática de la interfaz y de `data/sectores.json`; no hace falta ejecutar el servidor Node en GitHub Pages.
