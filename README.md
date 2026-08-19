# PDF Watermark Manager

Herramienta para eliminar el watermark original de PDFs e imagenes generados por NotebookLM y reemplazarlo con un logo o texto personalizado.

Disponible en dos versiones:
- **Extension de Chrome** (Manifest V3): funciona desde el Side Panel del navegador.
- **CLI de Node.js**: herramienta de linea de comandos para procesamiento por lotes y automatizacion.

Ambas versiones comparten exactamente la misma logica de reemplazo de watermark.

---

## Tabla de contenidos

- [Caracteristicas](#caracteristicas)
- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Extension de Chrome](#extension-de-chrome)
  - [Instalacion](#instalacion-extension)
  - [Uso](#uso-extension)
- [CLI de Node.js](#cli-de-nodejs)
  - [Instalacion](#instalacion-cli)
  - [Uso](#uso-cli)
  - [Ejemplos](#ejemplos)
- [Como funciona el reemplazo de watermark](#como-funciona-el-reemplazo-de-watermark)
  - [Deteccion de color de fondo](#deteccion-de-color-de-fondo)
  - [Posicion y tamano del parche](#posicion-y-tamano-del-parche)
  - [Inversion inteligente del logo](#inversion-inteligente-del-logo)
  - [Texto con color adaptativo](#texto-con-color-adaptativo)
- [Procesamiento de archivos](#procesamiento-de-archivos)
  - [PDFs](#pdfs)
  - [Imagenes](#imagenes)
- [Dependencias](#dependencias)
- [Permisos (Extension)](#permisos)

---

## Caracteristicas

- **Elimina el watermark de NotebookLM** de slides PDF con un parche del color exacto del fondo.
- **Reemplazo personalizado**: logo PNG (con transparencia) o texto libre.
- **Inversion inteligente del logo**: analiza el brillo tanto del logo como del fondo para decidir automaticamente si invertir los colores del logo, garantizando contraste en cualquier combinacion.
- **Color de texto adaptativo**: negro sobre fondos claros, blanco sobre fondos oscuros.
- **Deteccion automatica de color de fondo**: muestrea el pixel adyacente al parche para igualar el color de fondo de cada pagina individualmente.
- **Batch processing**: soporta multiples archivos en una sola operacion.
- **Soporte dual**: PDFs multi-pagina e imagenes (PNG, JPG, GIF, WebP, BMP, TIFF).
- **Alta calidad**: render de PDF a 3x scale, export en JPEG 92% para PDFs y PNG para imagenes.

---

## Arquitectura

```
Watermark-NotebookLM/
  |
  +-- Extension Chrome (Manifest V3)
  |     |
  |     +-- background.js ............ Service Worker (abre el Side Panel)
  |     +-- sidepanel.html ........... UI del panel lateral
  |     |     +-- styles.css ......... Tema oscuro con variables CSS
  |     |     +-- lib/jspdf.umd.min.js
  |     +-- sidepanel.js ............. Logica principal (modulo ES)
  |           +-- pdf.js (pdfjsLib) .. Render de paginas PDF en canvas
  |           +-- jsPDF .............. Generacion del PDF de salida
  |           +-- Canvas 2D API ...... Manipulacion de pixeles y dibujo
  |
  +-- CLI de Node.js (cli/)
        |
        +-- index.js ................. Entry point, parseo de argumentos (commander)
        +-- watermark.js ............. Logica de procesamiento (portable, sin DOM)
        +-- package.json ............. Dependencias: canvas, pdfjs-dist, jspdf, commander
```

La extension usa `chrome.sidePanel` API para abrirse como panel lateral en Chrome. La CLI es una herramienta standalone que replica exactamente la misma logica de negocio.

Todo el procesamiento ocurre **localmente**; no hay envio de datos a servidores externos.

---

## Estructura del proyecto

```
Watermark-NotebookLM/
  manifest.json              Configuracion de la extension (Manifest V3)
  background.js              Service Worker - abre Side Panel al clickear el icono
  sidepanel.html             Interfaz del panel lateral
  sidepanel.js               Logica principal de procesamiento (modulo ES)
  styles.css                 Estilos del panel (tema oscuro)
  lib/
    pdf.mjs                  pdf.js - libreria de renderizado PDF
    pdf.worker.mjs           Worker de pdf.js
    jspdf.js                 jsPDF sin minificar (referencia)
    jspdf.umd.min.js         jsPDF UMD - generacion de PDFs
  inputs/
    (imagenes de prueba)      Agregar PDFs o imagenes aqui para validacion local
                              (no incluidas en el repo)
  cli/                       CLI de Node.js (ver seccion dedicada)
    index.js                 Entry point con commander
    watermark.js             Logica de applyWatermark, processPDF, processImage
    package.json             Dependencias npm de la CLI
    node_modules/            Dependencias instaladas (no commitear)
  package.json               Dependencias npm de la extension (referencia; libs van en /lib)
```

---

## Extension de Chrome

### Instalacion (Extension)

1. Clonar o descargar este repositorio.
2. (Opcional) Ejecutar `npm install` para descargar dependencias de referencia. Las librerias necesarias ya estan incluidas en `/lib`.
3. Abrir Chrome y navegar a `chrome://extensions`.
4. Activar **Modo de desarrollador** (esquina superior derecha).
5. Clickear **"Cargar extension sin empaquetar"**.
6. Seleccionar la carpeta `Watermark-NotebookLM/`.
7. La extension aparece como "PDF Watermark Manager" en la barra de extensiones.

### Uso (Extension)

1. Clickear el icono de la extension para abrir el **Side Panel**.
2. Arrastrar archivos PDF o imagenes al area de drop (o clickear para seleccionar).
3. Configurar el watermark de reemplazo:
   - **Texto**: escribir en el campo "Custom Text" (ej: `My Brand`).
   - **Logo**: subir un PNG con transparencia.
   - Si se sube un logo, tiene prioridad sobre el texto.
4. Clickear **"Process PDF"**.
5. El archivo procesado se descarga automaticamente como `processed_<nombre-original>`.

---

## CLI de Node.js

Herramienta de linea de comandos que replica exactamente la funcionalidad de la extension Chrome, ideal para procesamiento por lotes, automatizacion y uso en servidores.

### Instalacion (CLI)

```bash
cd cli/
npm install
```

**Requisitos**: Node.js 18+ y las dependencias nativas de `canvas` (node-canvas). En macOS generalmente funciona sin configuracion adicional. En Linux puede requerir:
```bash
# Ubuntu/Debian
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

# Fedora
sudo dnf install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel librsvg2-devel
```

### Uso (CLI)

```bash
# Con texto
node cli/index.js --input archivo.pdf --text "Mi Marca"

# Con logo
node cli/index.js --input archivo.pdf --logo logo.png

# Con imagen en vez de PDF
node cli/index.js --input slide.png --logo logo.png

# Multiples archivos
node cli/index.js --input archivo1.pdf archivo2.pdf --logo logo.png

# Output personalizado (opcional, default: processed_<nombre>)
node cli/index.js --input archivo.pdf --text "Mi Marca" --output salida.pdf
```

**Opciones**:
- `--input <paths...>` (requerido): uno o mas archivos de entrada (PDF o imagen)
- `--text <text>`: texto a usar como watermark
- `--logo <path>`: ruta a archivo de logo (PNG recomendado con transparencia)
- `--output <path>`: ruta de salida personalizada (solo para un archivo)

**Nota**: Debes proporcionar `--text` o `--logo`. Si se proporciona ambos, el logo tiene prioridad.

### Ejemplos

```bash
# Procesar un PDF con texto
node cli/index.js --input presentacion.pdf --text "Empresa S.A."

# Procesar con logo personalizado
node cli/index.js --input slides.pdf --logo ./assets/logo-blanco.png

# Procesar multiples PDFs con el mismo logo
node cli/index.js --input *.pdf --logo logo.png

# Procesar una imagen
node cli/index.js --input captura.png --text "Confidencial"

# Output en ruta especifica
node cli/index.js --input reporte.pdf --text "Borrador" --output ./output/reporte-marcado.pdf
```

**Output por defecto**: Los archivos se guardan como `processed_<nombre-original>` en el mismo directorio que el archivo de entrada.

---

## Como funciona el reemplazo de watermark

### Deteccion de color de fondo

Para cada pagina/imagen, la funcion `applyWatermark()`:

1. Define el area del parche (esquina inferior derecha).
2. Muestrea un pixel **justo afuera del borde izquierdo** del parche (`patchX - 20`).
3. Extrae los valores RGB de ese pixel con `ctx.getImageData()`.
4. Usa ese color exacto como `fillStyle` del parche, igualando el fondo de la pagina.
5. Calcula el **brillo percibido** con la formula ITU-R BT.601:

   ```
   brightness = (R * 299 + G * 587 + B * 114) / 1000
   ```

   Este valor (0-255) se usa para decidir el color del texto y la inversion del logo.

Si el muestreo falla (ej: por restricciones CORS en la extension), defaultea a blanco.

### Posicion y tamano del parche

El parche cubre la esquina inferior derecha de cada pagina, donde se ubica el watermark de NotebookLM (icono + texto "NotebookLM"):

| Parametro    | Valor                      | Descripcion                                |
|--------------|----------------------------|--------------------------------------------|
| `patchWidth` | `width * 0.155` (15.5%)    | Ancho del parche                           |
| `patchHeight`| `height * 0.045` (4.5%)    | Alto del parche                            |
| `patchX`     | `width - patchWidth`        | Pegado al borde derecho                    |
| `patchY`     | `height - patchHeight - (height * 0.005)` | Borde inferior + offset 0.5% hacia arriba |

El offset vertical de 0.5% asegura cobertura completa del watermark incluso cuando no esta completamente al ras del borde inferior.

### Inversion inteligente del logo

Cuando se usa un logo PNG, el sistema analiza **tanto el brillo del logo como el del fondo** para decidir si invertirlo:

**Paso 1 - Analisis del logo:**
- Se dibuja el logo en un canvas offscreen temporal.
- Se extraen los pixeles con `getImageData()`.
- Se calcula el brillo promedio **solo de los pixeles opacos** (alpha > 128), ignorando los transparentes para evitar sesgo.

**Paso 2 - Decision por contraste:**

| Logo   | Fondo  | Contraste natural? | Accion         |
|--------|--------|--------------------| ---------------|
| Oscuro | Claro  | Si                 | Dibujar tal cual |
| Claro  | Oscuro | Si                 | Dibujar tal cual |
| Oscuro | Oscuro | No                 | Invertir logo  |
| Claro  | Claro  | No                 | Invertir logo  |

**Extension**: La inversion se aplica con `offCtx.filter = 'invert(1)'` sobre un canvas offscreen.

**CLI**: La inversion se implementa mediante manipulacion directa de pixeles (no depende de `ctx.filter`, que puede no estar soportado en node-canvas):
```javascript
const invertData = offCtx.getImageData(0, 0, width, height);
const px = invertData.data;
for (let i = 0; i < px.length; i += 4) {
    px[i]     = 255 - px[i];     // R
    px[i + 1] = 255 - px[i + 1]; // G
    px[i + 2] = 255 - px[i + 2]; // B
    // Alpha no se toca
}
offCtx.putImageData(invertData, 0, 0);
```

### Texto con color adaptativo

Cuando no hay logo y se usa texto personalizado:

- **Fondo claro** (`brightness > 128`): texto en **negro** (`#000000`).
- **Fondo oscuro** (`brightness <= 128`): texto en **blanco** (`#ffffff`).

El texto se centra dentro del parche con `textAlign: 'center'` y `textBaseline: 'middle'`.

Font: `bold ${width * 0.011}px sans-serif`

---

## Procesamiento de archivos

### PDFs

1. Se carga el PDF con **pdf.js** (`pdfjsLib.getDocument()` / `getDocument()`).
2. Cada pagina se renderiza en un canvas a **3x scale** para alta calidad.
3. Se aplica `applyWatermark()` sobre cada pagina.
4. El canvas resultante se exporta como JPEG al 92% de calidad.
5. Se reconstruye un nuevo PDF con **jsPDF**, detectando orientacion (landscape si `width > height`, portrait si no) por pagina.
6. Se guarda como `processed_<nombre-original>.pdf`.

### Imagenes

1. Se carga la imagen en un canvas al tamano original.
2. Se aplica `applyWatermark()`.
3. Se exporta como PNG (sin perdida) y se guarda como `processed_<nombre-original>`.

---

## Dependencias

### Extension de Chrome

| Libreria   | Version | Ubicacion          | Funcion                         |
|------------|---------|--------------------|----------------------------------|
| pdf.js     | 5.x     | `lib/pdf.mjs`      | Render de paginas PDF en canvas  |
| jsPDF      | 4.x     | `lib/jspdf.umd.min.js` | Generacion del PDF de salida |

Ambas librerias estan incluidas localmente en `/lib`. No requieren conexion a internet para funcionar.

### CLI de Node.js

| Libreria     | Version  | Funcion                                              |
|--------------|----------|-------------------------------------------------------|
| canvas       | ^3.1.0   | API de Canvas 2D en Node.js (node-canvas)            |
| pdfjs-dist   | ^3.11.174| Render de paginas PDF en canvas (compatible con Node)|
| jspdf        | ^4.1.0   | Generacion del PDF de salida                         |
| commander    | ^13.1.0  | Parseo de argumentos CLI                             |

**Nota sobre pdfjs-dist**: La CLI usa version 3.x en lugar de 5.x porque la version 5 no soporta correctamente el render de PDFs con imagenes inline en Node.js (falla con error "Image or Canvas expected"). La version 3.11.174 incluye soporte nativo para Node.js con la clase `NodeCanvasFactory`.

---

## Permisos (Extension)

| Permiso       | Uso                                                    |
|---------------|---------------------------------------------------------|
| `sidePanel`   | Abrir la interfaz como panel lateral de Chrome          |
| `<all_urls>`  | Acceso a recursos web para las librerias del worker     |

Todo el procesamiento de archivos ocurre **localmente** en el navegador o en la maquina del usuario (CLI). No se envia ni recibe data de servidores externos.

---

## Comparacion Extension vs CLI

| Aspecto              | Extension Chrome                    | CLI de Node.js                      |
|----------------------|-------------------------------------|-------------------------------------|
| **Interfaz**         | GUI en Side Panel                   | Linea de comandos                   |
| **Batch processing** | Si (con barra de progreso visual)   | Si (con mensajes en consola)        |
| **Automatizacion**   | Manual (drag & drop)                | Scriptable, integrable en pipelines |
| **Servidor**         | No                                  | Si (puede correr en servidores)     |
| **Dependencias**     | Incluidas en `/lib`                 | npm (`canvas`, `pdfjs-dist`, etc.)  |
| **Inversion logo**   | `ctx.filter = 'invert(1)'`          | Manipulacion directa de pixeles     |
| **Logica de negocio**| Identica                            | Identica                            |
| **Valores numericos**| Identicos                           | Identicos                           |

Ambas versiones producen resultados visualmente identicos para los mismos archivos de entrada.
