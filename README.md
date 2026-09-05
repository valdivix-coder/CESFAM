# Consulta de sectores CESFAM

Aplicación web para consultar a qué sector CESFAM pertenece una calle.

## Ver la aplicación

1. Instala [Node.js](https://nodejs.org/) 20.12 o superior.
2. En una terminal, desde la carpeta del proyecto, ejecuta:

   ```bash
   npm start
   ```

3. Abre **http://localhost:3000** en tu navegador.
4. Escribe una calle y selecciona **Buscar**. La búsqueda no distingue entre mayúsculas/minúsculas ni tildes.

Puedes probar con estas tres calles:

| Calle | Resultado esperado |
| --- | --- |
| `Los Coigües` | Sector Amarillo |
| `Millahuin` | Sector Azul |
| `Ámbar` | Sector Verde |

### Calles divididas por numeración

La planilla parte 17 calles del centro entre dos sectores según el número de la
casa (`ANDRÉS BELLO, MENOR DE 800` en Amarillo y `ANDRÉS BELLO, MAYOR DE 800` en
Azul). Basta con escribir el nombre de la calle:

- Sin número, la consulta muestra **los dos tramos** para que elijas.
- Con el número en el campo `Nº` —o escrito al final, como `Andrés Bello 950`—
  la consulta responde con **un solo sector**.

El número que marca la división (800) es ambiguo en la planilla original, así que
la aplicación muestra los dos sectores y avisa que hay que confirmarlo con el
CESFAM, en lugar de elegir uno por su cuenta. Lo mismo ocurre con `Barros Arana`,
que la planilla lista en dos sectores sin indicar tramos.

Si una calle no aparece, la aplicación propone los nombres parecidos que sí están
en la base.

## Ejecutar las pruebas automáticas

```bash
npm test
```

Cubren la búsqueda, el conversor de la planilla, el servidor local y la interfaz.

## Regenerar la base desde la planilla Excel

La base usada por la interfaz es `data/sectores.json`. Para reconstruirla desde
`Sectores Cesfam nuevo.xlsx`, ejecuta:

```bash
npm run convert:sectors
```

El conversor utiliza únicamente Python 3 y las bibliotecas estándar. Lee los
sectores desde la fila 2 de la planilla, así que agregar una columna nueva no
exige tocar el código. Al terminar avisa por consola de las calles que quedan
listadas en más de un sector sin tramo de numeración; con `--strict` esos avisos
hacen fallar la conversión.

### Formato de `data/sectores.json`

```jsonc
{
  "version": 2,
  "source": "Sectores Cesfam nuevo.xlsx",
  "sectors": [{
    "id": "amarillo",
    "name": "Sector Amarillo",
    "streets": [{
      "name": "ANDRÉS BELLO, MENOR DE 800",   // tal como aparece en la planilla
      "normalizedName": "ANDRES BELLO, MENOR DE 800",
      "baseName": "ANDRÉS BELLO",             // nombre sin el tramo
      "normalizedBase": "ANDRES BELLO",       // clave de búsqueda
      "range": { "comparator": "lt", "pivot": 800, "label": "menor de 800" }
    }]
  }]
}
```

`range` solo aparece en las calles divididas por numeración: `lt` cubre los
números menores al pivote y `gte` el resto.

## Publicar en GitHub Pages

El repositorio incluye un flujo de despliegue automático. Para publicarlo:

1. Sube estos cambios a la rama `main` de GitHub.
2. En GitHub, abre **Settings → Pages**.
3. En **Build and deployment**, selecciona **GitHub Actions** como fuente.
4. Abre la pestaña **Actions** y espera que termine el flujo **Deploy CESFAM lookup to GitHub Pages**.
5. GitHub mostrará la URL pública. En este repositorio normalmente será `https://valdivix-coder.github.io/CESFAM/`.

Desde ese momento, cada cambio enviado a `main` actualiza la aplicación automáticamente. El flujo prepara una versión estática de la interfaz y de `data/sectores.json`; no hace falta ejecutar el servidor Node en GitHub Pages.
