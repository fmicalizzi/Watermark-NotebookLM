#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { processPDF, processImage } from './watermark.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

program
    .name('watermark')
    .description('Replace NotebookLM watermarks in PDFs and images with custom text or logo')
    .requiredOption('--input <paths...>', 'Input file(s) - PDF or image')
    .option('--text <text>', 'Text to use as watermark')
    .option('--logo <path>', 'Path to logo image file')
    .option('--output <path>', 'Custom output path (for single file only)');

program.parse();

const options = program.opts();

if (!options.text && !options.logo) {
    console.error('Error: You must provide either --text or --logo');
    process.exit(1);
}

if (options.logo && !fs.existsSync(options.logo)) {
    console.error(`Error: Logo file not found: ${options.logo}`);
    process.exit(1);
}

if (options.output && options.input.length > 1) {
    console.error('Error: --output can only be used with a single input file');
    process.exit(1);
}

const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff'];

function getOutputPath(inputPath) {
    if (options.output) {
        return path.resolve(options.output);
    }

    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    return path.join(dir, `processed_${base}${ext}`);
}

async function main() {
    const inputFiles = options.input.map(f => path.resolve(f));

    for (const inputPath of inputFiles) {
        if (!fs.existsSync(inputPath)) {
            console.error(`Error: Input file not found: ${inputPath}`);
            continue;
        }

        const ext = path.extname(inputPath).toLowerCase();
        const outputPath = getOutputPath(inputPath);

        console.log(`\nProcessing: ${inputPath}`);

        try {
            if (ext === '.pdf') {
                await processPDF(inputPath, outputPath, {
                    logoPath: options.logo ? path.resolve(options.logo) : null,
                    text: options.text
                });
            } else if (imageExtensions.includes(ext)) {
                await processImage(inputPath, outputPath, {
                    logoPath: options.logo ? path.resolve(options.logo) : null,
                    text: options.text
                });
            } else {
                console.error(`Unsupported file type: ${ext}`);
            }
        } catch (err) {
            console.error(`Error processing ${inputPath}: ${err.message}`);
        }
    }

    console.log('\nDone!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
