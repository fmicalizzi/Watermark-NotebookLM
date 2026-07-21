# PDF Watermark Manager

Extension de Chrome (Manifest V3) que elimina el watermark original de PDFs generados por NotebookLM y lo reemplaza con un logo o texto personalizado. Tambien soporta imagenes sueltas.

Funciona desde el **Side Panel** del navegador.

---

## Tabla de contenidos

- [Caracteristicas](#caracteristicas)
- [Arquitectura](#arquitectura)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Instalacion](#instalacion)
- [Uso](#uso)
- [Como funciona el reemplazo de watermark](#como-funciona-el-reemplazo-de-watermark)
  - [Deteccion de color de fondo](#deteccion-de-color-de-fondo)
  - [Posicion y tamano del parche](#posicion-y-tamano-del-parche)
  - [Inversion inteligente del logo](#inversion-inteligente-del-logo)
  - [Texto con color adaptativo](#texto-con-color-adaptativo)
- [Procesamiento de archivos](#procesamiento-de-archivos)
  - [PDFs](#pdfs)
  - [Imagenes](#imagenes)
- [Dependencias](#dependencias)
- [Permisos](#permisos)

---

## Caracteristicas

- **Elimina el watermark de NotebookLM** de slides PDF con un parche del color exacto del fondo.
- **Reemplazo personalizado**: logo PNG (con transparencia) o texto libre.
- **Inversion inteligente del logo**: analiza el brillo tanto del logo como del fondo para decidir automaticamente si invertir los colores del logo, garantizando contraste en cualquier combinacion.
- **Color de texto adaptativo**: negro sobre fondos claros, blanco sobre fondos oscuros.
- **Deteccion automatica de color de fondo**: muestrea el pixel adyacente al parche para igualar el color de fondo de cada pagina individualmente.
- **Batch processing**: soporta multiples archivos en una sola operacion con barra de progreso.
- **Soporte dual**: PDFs multi-pagina e imagenes (PNG, JPG).
- **Alta calidad**: render de PDF a 3x scale, export en JPEG 92% para PDFs y PNG para imagenes.

---

## Arquitectura

```
Extension Chrome - Manifest V3
  |
  +-- background.js ............ Service Worker (abre el Side Panel)
  |
  +-- sidepanel.html ........... UI del panel lateral
  |     +-- styles.css ......... Tema oscuro con variables CSS
  |     +-- lib/jspdf.umd.min.js
  |
  +-- sidepanel.js ............. Logica principal (modulo ES)
        |
        +-- pdf.js (pdfjsLib) .. Render de paginas PDF en canvas
        +-- jsPDF .............. Generacion del PDF de salida
        +-- Canvas 2D API ...... Manipulacion de pixeles y dibujo
```

La extension usa `chrome.sidePanel` API para abrirse como panel lateral en Chrome. Todo el procesamiento ocurre localmente en el navegador; no hay envio de datos a servidores externos.

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
    1.png, 1x1.png,          Imagenes de prueba para validacion
    vertical.png
  package.json               Dependencias npm (referencia; libs van en /lib)
```

---

## Instalacion

1. Clonar o descargar este repositorio.
2. (Opcional) Ejecutar `npm install` para descargar dependencias de referencia. Las librerias necesarias ya estan incluidas en `/lib`.
3. Abrir Chrome y navegar a `chrome://extensions`.
4. Activar **Modo de desarrollador** (esquina superior derecha).
5. Clickear **"Cargar extension sin empaquetar"**.
6. Seleccionar la carpeta `Watermark-NotebookLM/`.
7. La extension aparece como "PDF Watermark Manager" en la barra de extensiones.

---

## Uso

1. Clickear el icono de la extension para abrir el **Side Panel**.
2. Arrastrar archivos PDF o imagenes al area de drop (o clickear para seleccionar).
3. Configurar el watermark de reemplazo:
   - **Texto**: escribir en el campo "Custom Text" (ej: `My Brand`).
   - **Logo**: subir un PNG con transparencia.
   - Si se sube un logo, tiene prioridad sobre el texto.
4. Clickear **"Process PDF"**.
5. El archivo procesado se descarga automaticamente como `processed_<nombre-original>`.

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

Si el muestreo falla (ej: por restricciones CORS), defaultea a blanco.

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

La inversion se aplica con `offCtx.filter = 'invert(1)'` sobre un canvas offscreen, y el resultado se dibuja en el canvas principal.

### Texto con color adaptativo

Cuando no hay logo y se usa texto personalizado:

- **Fondo claro** (`brightness > 128`): texto en **negro** (`#000000`).
- **Fondo oscuro** (`brightness <= 128`): texto en **blanco** (`#ffffff`).

El texto se centra dentro del parche con `textAlign: 'center'` y `textBaseline: 'middle'`.

---

## Procesamiento de archivos

### PDFs

1. Se carga el PDF con **pdf.js** (`pdfjsLib.getDocument()`).
2. Cada pagina se renderiza en un canvas a **3x scale** para alta calidad.
3. Se aplica `applyWatermark()` sobre cada pagina.
4. El canvas resultante se exporta como JPEG al 92% de calidad.
5. Se reconstruye un nuevo PDF con **jsPDF**, detectando orientacion (landscape/portrait) por pagina.
6. Se descarga como `processed_<nombre-original>.pdf`.

### Imagenes

1. Se carga la imagen en un canvas al tamaño original.
2. Se aplica `applyWatermark()`.
3. Se exporta como PNG (sin perdida) y se descarga como `processed_<nombre-original>`.

---

## Dependencias

| Libreria   | Version | Ubicacion          | Funcion                         |
|------------|---------|--------------------|----------------------------------|
| pdf.js     | 5.x     | `lib/pdf.mjs`      | Render de paginas PDF en canvas  |
| jsPDF      | 4.x     | `lib/jspdf.umd.min.js` | Generacion del PDF de salida |

Ambas librerias estan incluidas localmente en `/lib`. No requieren conexion a internet para funcionar.

---

## Permisos

| Permiso       | Uso                                                    |
|---------------|---------------------------------------------------------|
| `sidePanel`   | Abrir la interfaz como panel lateral de Chrome          |
| `<all_urls>`  | Acceso a recursos web para las librerias del worker     |

Todo el procesamiento de archivos ocurre **localmente** en el navegador. No se envia ni recibe data de servidores externos.
