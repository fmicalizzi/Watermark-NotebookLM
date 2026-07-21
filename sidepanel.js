
import * as pdfjsLib from './lib/pdf.mjs';

console.log('Sidepanel script loaded');

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.mjs';

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const watermarkText = document.getElementById('watermarkText');
const logoInput = document.getElementById('logoInput');
const processBtn = document.getElementById('processBtn');
const progressContainer = document.getElementById('progressContainer');
const statusMessage = document.getElementById('statusMessage');
const progressPercent = document.getElementById('progressPercent');
const progressFill = document.getElementById('progressFill');

if (dropZone) console.log('Dropzone found');

let fileQueue = [];
let customLogoData = null; // Data URL of the custom logo

// --- Event Listeners ---

dropZone.addEventListener('click', () => {
    fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileSelect(e.target.files);
    }
});

logoInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        const reader = new FileReader();
        reader.onload = (event) => {
            customLogoData = event.target.result;
        };
        reader.readAsDataURL(e.target.files[0]);
    }
});

processBtn.addEventListener('click', async () => {
    if (fileQueue.length === 0) return;
    processBtn.disabled = true;

    try {
        for (let i = 0; i < fileQueue.length; i++) {
            const file = fileQueue[i];
            const currentProgressBase = (i / fileQueue.length) * 100;

            showStatus(`Processing ${file.name}...`, currentProgressBase);

            if (file.type === 'application/pdf') {
                await processPDF(file);
            } else if (file.type.startsWith('image/')) {
                await processImage(file);
            } else {
                console.warn(`Skipping unsupported file: ${file.name}`);
            }
        }
        showStatus('All files processed!', 100);
    } catch (err) {
        console.error(err);
        showStatus('Error: ' + err.message, 0, true);
    } finally {
        processBtn.disabled = false;
        fileQueue = []; // Clear queue after processing
        dropZone.querySelector('p').innerHTML = 'Drag & Drop PDF or Image<br>or click to select';
    }
});

function handleFileSelect(files) {
    fileQueue = Array.from(files).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));

    if (fileQueue.length === 0) {
        alert('Please upload PDF or Image files.');
        return;
    }

    const text = fileQueue.length === 1
        ? `Selected: ${fileQueue[0].name}`
        : `Selected: ${fileQueue.length} files`;

    dropZone.querySelector('p').textContent = text;
    processBtn.disabled = false;
}

function showStatus(msg, percent, isError = false) {
    progressContainer.classList.add('active');
    statusMessage.textContent = msg;
    statusMessage.style.color = isError ? 'red' : '#94a3b8';
    progressPercent.textContent = Math.round(percent) + '%';
    progressFill.style.width = percent + '%';
}

// --- Shared Watermark Logic ---

async function applyWatermark(ctx, width, height) {
    // Target Area: Bottom Right Corner
    // Logic: 12% Width, Flush Right/Bottom, 3.5% Height

    const patchWidth = width * 0.155;
    const patchHeight = height * 0.045;

    // Position: Flush with edges, slight upward offset for full coverage
    const patchX = width - patchWidth;
    const patchY = height - patchHeight - (height * 0.005);

    // Detect background color (sample just outside the left edge of the patch)
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

    // Draw the "Eraser" patch
    ctx.fillStyle = patchColor;
    ctx.fillRect(patchX, patchY, patchWidth, patchHeight);

    // --- Draw Logo or Text ---
    if (customLogoData) {
        const img = new Image();
        img.src = customLogoData;
        await new Promise(resolve => img.onload = resolve);

        const logoAspect = img.width / img.height;

        let drawH = patchHeight * 0.70;
        let drawW = drawH * logoAspect;

        // Tighter constraint on width
        if (drawW > patchWidth * 0.9) {
            drawW = patchWidth * 0.9;
            drawH = drawW / logoAspect;
        }

        // Center in the patch
        let drawX = patchX + (patchWidth - drawW) / 2;
        let drawY = patchY + (patchHeight - drawH) / 2;

        const analysisCanvas = document.createElement('canvas');
        analysisCanvas.width = img.width;
        analysisCanvas.height = img.height;
        const analysisCtx = analysisCanvas.getContext('2d');
        analysisCtx.drawImage(img, 0, 0);

        const imgData = analysisCtx.getImageData(0, 0, img.width, img.height);
        const pixels = imgData.data;
        let totalBrightness = 0;
        let opaquePixels = 0;

        for (let p = 0; p < pixels.length; p += 4) {
            if (pixels[p + 3] > 128) {
                totalBrightness += (pixels[p] * 299 + pixels[p+1] * 587 + pixels[p+2] * 114) / 1000;
                opaquePixels++;
            }
        }

        const logoBrightness = opaquePixels > 0 ? totalBrightness / opaquePixels : 128;
        const needsInvert = (logoBrightness > 128) === (brightness > 128);

        if (needsInvert) {
            const offCanvas = document.createElement('canvas');
            offCanvas.width = drawW;
            offCanvas.height = drawH;
            const offCtx = offCanvas.getContext('2d');
            offCtx.filter = 'invert(1)';
            offCtx.drawImage(img, 0, 0, drawW, drawH);
            ctx.drawImage(offCanvas, drawX, drawY, drawW, drawH);
        } else {
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }

    } else if (watermarkText.value) {
        const text = watermarkText.value;
        ctx.font = `bold ${width * 0.011}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = brightness > 128 ? '#000000' : '#ffffff';

        // Center text in patch
        const textX = patchX + patchWidth / 2;
        const textY = patchY + patchHeight / 2;
        ctx.fillText(text, textX, textY);
    }
}

// --- Image Processing Logic ---

async function processImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const img = new Image();
                img.src = event.target.result;
                await new Promise(r => img.onload = r);

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw original image
                ctx.drawImage(img, 0, 0);

                // Apply Watermark Logic
                await applyWatermark(ctx, canvas.width, canvas.height);

                // Download Processed Image
                const link = document.createElement('a');
                link.download = `processed_${file.name}`;
                link.href = canvas.toDataURL('image/png'); // Default to PNG for images
                link.click();

                resolve();
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- PDF Processing Logic ---

async function processPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const numPages = pdf.numPages;
    const { jsPDF } = window.jspdf;

    const newPdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4',
        putOnlyUsedFonts: true,
        floatPrecision: 16
    });
    newPdf.deletePage(1);

    const renderScale = 3.0; // High quality

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

        // Apply shared watermark logic
        await applyWatermark(ctx, viewport.width, viewport.height);

        // --- Add to new PDF ---
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pdfPageWidth = viewport.width / renderScale;
        const pdfPageHeight = viewport.height / renderScale;

        newPdf.addPage([pdfPageWidth, pdfPageHeight], viewport.width > viewport.height ? 'l' : 'p');
        newPdf.addImage(imgData, 'JPEG', 0, 0, pdfPageWidth, pdfPageHeight);
    }

    newPdf.save(`processed_${file.name}`);
}
