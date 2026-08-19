import { createCanvas, loadImage, Image } from 'canvas';
import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.js';
import { jsPDF } from 'jspdf';

class NodeCanvasFactory {
    create(width, height) {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
    }

    reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }

    destroy(canvasAndContext) {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}

export async function applyWatermark(ctx, width, height, options) {
    const { logoImage, text } = options;

    const patchWidth = width * 0.155;
    const patchHeight = height * 0.045;

    const patchX = width - patchWidth;
    const patchY = height - patchHeight - (height * 0.005);

    const sampleX = Math.max(0, patchX - 20);
    const sampleY = Math.min(height - 10, patchY + patchHeight / 2);

    let brightness = 255;
    let patchColor = 'rgb(255,255,255)';

    try {
        const pixelData = ctx.getImageData(sampleX, sampleY, 1, 1).data;
        const r = pixelData[0];
        const g = pixelData[1];
        const b = pixelData[2];
        brightness = (r * 299 + g * 587 + b * 114) / 1000;
        patchColor = `rgb(${r},${g},${b})`;
    } catch (e) {
        console.warn("Could not sample background color, defaulting to white");
    }

    ctx.fillStyle = patchColor;
    ctx.fillRect(patchX, patchY, patchWidth, patchHeight);

    if (logoImage) {
        const logoAspect = logoImage.width / logoImage.height;

        let drawH = patchHeight * 0.70;
        let drawW = drawH * logoAspect;

        if (drawW > patchWidth * 0.9) {
            drawW = patchWidth * 0.9;
            drawH = drawW / logoAspect;
        }

        const drawX = patchX + (patchWidth - drawW) / 2;
        const drawY = patchY + (patchHeight - drawH) / 2;

        const analysisCanvas = createCanvas(logoImage.width, logoImage.height);
        const analysisCtx = analysisCanvas.getContext('2d');
        analysisCtx.drawImage(logoImage, 0, 0);

        const imgData = analysisCtx.getImageData(0, 0, logoImage.width, logoImage.height);
        const pixels = imgData.data;
        let totalBrightness = 0;
        let opaquePixels = 0;

        for (let p = 0; p < pixels.length; p += 4) {
            if (pixels[p + 3] > 128) {
                totalBrightness += (pixels[p] * 299 + pixels[p + 1] * 587 + pixels[p + 2] * 114) / 1000;
                opaquePixels++;
            }
        }

        const logoBrightness = opaquePixels > 0 ? totalBrightness / opaquePixels : 128;
        const needsInvert = (logoBrightness > 128) === (brightness > 128);

        if (needsInvert) {
            const offCanvas = createCanvas(Math.ceil(drawW), Math.ceil(drawH));
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(logoImage, 0, 0, drawW, drawH);

            const invertData = offCtx.getImageData(0, 0, Math.ceil(drawW), Math.ceil(drawH));
            const px = invertData.data;
            for (let i = 0; i < px.length; i += 4) {
                px[i] = 255 - px[i];
                px[i + 1] = 255 - px[i + 1];
                px[i + 2] = 255 - px[i + 2];
            }
            offCtx.putImageData(invertData, 0, 0);

            ctx.drawImage(offCanvas, drawX, drawY, drawW, drawH);
        } else {
            ctx.drawImage(logoImage, drawX, drawY, drawW, drawH);
        }
    } else if (text) {
        ctx.font = `bold ${width * 0.011}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = brightness > 128 ? '#000000' : '#ffffff';

        const textX = patchX + patchWidth / 2;
        const textY = patchY + patchHeight / 2;
        ctx.fillText(text, textX, textY);
    }
}

export async function processPDF(inputPath, outputPath, options) {
    const data = new Uint8Array(fs.readFileSync(inputPath));
    const canvasFactory = new NodeCanvasFactory();
    const loadingTask = getDocument({
        data,
        canvasFactory,
        isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    console.log(`PDF has ${numPages} page(s)`);

    const newPdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4',
        putOnlyUsedFonts: true,
        floatPrecision: 16
    });
    newPdf.deletePage(1);

    const renderScale = 3.0;
    let logoImage = null;

    if (options.logoPath) {
        logoImage = await loadImage(options.logoPath);
    }

    for (let i = 1; i <= numPages; i++) {
        console.log(`Processing page ${i}/${numPages}...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        await page.render({ canvasContext: ctx, viewport: viewport, canvasFactory }).promise;

        await applyWatermark(ctx, viewport.width, viewport.height, {
            logoImage,
            text: options.text
        });

        const imgData = canvas.toBuffer('image/jpeg', { quality: 0.92 });
        const base64 = imgData.toString('base64');
        const jpegDataUrl = `data:image/jpeg;base64,${base64}`;

        const pdfPageWidth = viewport.width / renderScale;
        const pdfPageHeight = viewport.height / renderScale;

        newPdf.addPage([pdfPageWidth, pdfPageHeight], viewport.width > viewport.height ? 'l' : 'p');
        newPdf.addImage(jpegDataUrl, 'JPEG', 0, 0, pdfPageWidth, pdfPageHeight);
    }

    const pdfBuffer = newPdf.output('arraybuffer');
    fs.writeFileSync(outputPath, Buffer.from(pdfBuffer));
    console.log(`Saved: ${outputPath}`);
}

export async function processImage(inputPath, outputPath, options) {
    const img = await loadImage(inputPath);

    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    ctx.drawImage(img, 0, 0);

    let logoImage = null;
    if (options.logoPath) {
        logoImage = await loadImage(options.logoPath);
    }

    await applyWatermark(ctx, canvas.width, canvas.height, {
        logoImage,
        text: options.text
    });

    const pngBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, pngBuffer);
    console.log(`Saved: ${outputPath}`);
}
