# Consulta tu sector · CESFAM Pitrufquén

Aplicación web para consultar a qué sector del CESFAM Pitrufquén pertenece una
calle. Se instala en el teléfono y funciona sin señal.

## Actualizar la base de calles

Este es el único procedimiento que necesita saber quien mantiene la aplicación.
**No hace falta instalar nada ni usar la terminal.**

1. Entra a [el repositorio en GitHub](https://github.com/valdivix-coder/CESFAM).
2. Arrastra el Excel nuevo sobre el archivo `Sectores Cesfam nuevo.xlsx` y
   confirma el cambio.
3. Espera unos minutos. La aplicación queda actualizada sola.

Por dentro: el flujo **Regenerar la base desde la planilla** reconstruye
`data/sectores.json`, corre las pruebas y publica. Si la planilla tiene un
problema —una calle en dos sectores sin tramo de numeración, por ejemplo— queda
anotado en el registro del flujo, en la pestaña **Actions**.

El Excel manda: `data/sectores.json` se genera a partir de él y no debe editarse
a mano.

## Dónde está publicada

| | |
| --- | --- |
| Principal | Vercel |
| Respaldo | `https://valdivix-coder.github.io/CESFAM/` |

Las dos se actualizan solas con cada cambio en `main`. La aplicación usa rutas
relativas en todas partes, así que funciona igual en la raíz de un dominio que
en un subdirectorio.

### Conectar Vercel la primera vez

En [vercel.com](https://vercel.com) → **Add New… → Project** → importar este
repositorio. La configuración ya viene en `vercel.json`; solo hay que confirmar:

- **Framework preset:** Other
- **Build command:** `npm run build`
- **Output directory:** `site`

Cada rama recibe además una URL de previsualización, útil para revisar un cambio
antes de que sea público.

> El plan gratuito de Vercel es para uso personal no comercial. Conviene
> confirmar con ellos si corresponde antes de anunciar la aplicación como
> servicio municipal; si no, están el plan Pro o el respaldo en GitHub Pages,
> que no tiene esa restricción.

## Instalarla en el teléfono

- **Android:** aparece el botón «Instalar en tu teléfono» al pie de la página.
- **iPhone:** Safari no ofrece ese botón. Hay que usar **Compartir → Añadir a
  pantalla de inicio**.

Tras la primera visita queda guardada entera (235 KB) y **abre sin conexión**.
Cuando se publica una versión nueva, el teléfono la recoge en la visita
siguiente.

## Trabajar en el código

```bash
npm start     # servidor local en http://localhost:3000
npm test      # 64 pruebas: búsqueda, conversor, servidor, interfaz y build
npm run build # genera site/, que es lo que se publica
```

Requiere Node.js 20.12 o superior. Para regenerar la base a mano hace falta
además Python 3 (solo biblioteca estándar):

```bash
npm run convert:sectors
```

### Cómo está armado

| Archivo | Qué hace |
| --- | --- |
| `public/sector-lookup.js` | La búsqueda. Lo usan la página y las pruebas, sin duplicar lógica. |
| `public/app.js` | La interfaz: sugerencias, respuesta, instalación. |
| `public/sw.js` | Guarda la aplicación para que funcione sin señal. |
| `scripts/convert-sectores.py` | Excel → `data/sectores.json`. |
| `scripts/build-site.js` | Arma `site/` y sella la versión de la caché. |

Las tipografías están alojadas en el repositorio (`public/fonts/`): la página no
pide nada a terceros, así que conserva su aspecto sin conexión.

### Calles divididas por numeración

La planilla parte 17 calles del centro entre dos sectores según el número de la
casa (`ANDRÉS BELLO, MENOR DE 800` en Amarillo, `MAYOR DE 800` en Azul). Basta
escribir el nombre: si la calle se divide, la aplicación pide el número. Sin
número muestra los dos tramos.

El número exacto de la división (800) es ambiguo en la planilla original, así
que la aplicación muestra los dos sectores y avisa, en lugar de elegir uno por
su cuenta. Lo mismo con `Barros Arana`, que aparece en dos sectores sin tramos.

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

`range` solo aparece en las calles divididas: `lt` cubre los números menores al
pivote y `gte` el resto.

---

Desarrollado por Mg. Simón Valdivia · Psicólogo especializado en Desarrollo
Creativo e Inteligencia Artificial.
