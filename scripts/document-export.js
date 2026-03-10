const DocumentExportService = {
    PDF_PRESETS: {
        a4: { label: 'A4', widthMm: 210, heightMm: 297, renderWidth: 1240, renderHeight: 1754, format: 'a4' },
        a3: { label: 'A3', widthMm: 297, heightMm: 420, renderWidth: 1754, renderHeight: 2480, format: 'a3' }
    },
    WORD_PRESET: {
        label: '文档页',
        widthMm: 215.9,
        heightMm: 279.4,
        renderWidth: 1275,
        renderHeight: 1650
    },
    PPT_PRESETS: {
        wide: { label: '宽屏 16:9', slideWidthIn: 13.333, slideHeightIn: 7.5, renderWidth: 1600, renderHeight: 900, layout: 'LAYOUT_WIDE' },
        standard: { label: '标准 4:3', slideWidthIn: 10, slideHeightIn: 7.5, renderWidth: 1600, renderHeight: 1200, layout: 'LAYOUT_4x3' }
    },

    sanitizeFileName(name = 'document-export') {
        const trimmed = String(name).trim() || 'document-export';
        return trimmed.replace(/[\\/:*?"<>|]+/g, '-');
    },

    getRenderSpec(format, preset, orientation = 'portrait') {
        if (format === 'pdf') {
            const base = this.PDF_PRESETS[preset] || this.PDF_PRESETS.a4;
            if (orientation === 'landscape') {
                return {
                    width: base.renderHeight,
                    height: base.renderWidth,
                    widthMm: base.heightMm,
                    heightMm: base.widthMm,
                    formatName: base.format
                };
            }

            return {
                width: base.renderWidth,
                height: base.renderHeight,
                widthMm: base.widthMm,
                heightMm: base.heightMm,
                formatName: base.format
            };
        }

        if (format === 'word') {
            const base = this.WORD_PRESET;
            if (orientation === 'landscape') {
                return {
                    width: base.renderHeight,
                    height: base.renderWidth,
                    widthMm: base.heightMm,
                    heightMm: base.widthMm
                };
            }

            return {
                width: base.renderWidth,
                height: base.renderHeight,
                widthMm: base.widthMm,
                heightMm: base.heightMm
            };
        }

        const base = this.PPT_PRESETS[preset] || this.PPT_PRESETS.wide;
        return {
            width: base.renderWidth,
            height: base.renderHeight,
            slideWidthIn: base.slideWidthIn,
            slideHeightIn: base.slideHeightIn,
            layout: base.layout
        };
    },

    loadImage(dataUrl) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('加载图片失败'));
            image.src = dataUrl;
        });
    },

    drawImageWithFit(ctx, image, targetWidth, targetHeight, fit = 'contain') {
        const imageRatio = image.width / image.height;
        const targetRatio = targetWidth / targetHeight;

        let drawWidth;
        let drawHeight;
        let offsetX;
        let offsetY;

        if (fit === 'cover') {
            if (imageRatio > targetRatio) {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imageRatio;
                offsetX = (targetWidth - drawWidth) / 2;
                offsetY = 0;
            } else {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imageRatio;
                offsetX = 0;
                offsetY = (targetHeight - drawHeight) / 2;
            }
        } else {
            if (imageRatio > targetRatio) {
                drawWidth = targetWidth;
                drawHeight = targetWidth / imageRatio;
                offsetX = 0;
                offsetY = (targetHeight - drawHeight) / 2;
            } else {
                drawHeight = targetHeight;
                drawWidth = targetHeight * imageRatio;
                offsetX = (targetWidth - drawWidth) / 2;
                offsetY = 0;
            }
        }

        ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    },

    async renderPageImage(imageInfo, options) {
        const spec = this.getRenderSpec(options.format, options.preset, options.orientation);
        const canvas = document.createElement('canvas');
        canvas.width = spec.width;
        canvas.height = spec.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('创建导出画布失败');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const image = await this.loadImage(imageInfo.dataUrl);
        this.drawImageWithFit(ctx, image, canvas.width, canvas.height, options.fit);

        return {
            dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            width: canvas.width,
            height: canvas.height
        };
    },

    async buildRenderedPages(images, options, onProgress = () => { }) {
        const pages = [];

        for (let i = 0; i < images.length; i++) {
            pages.push(await this.renderPageImage(images[i], options));
            onProgress({
                stage: 'render',
                current: i + 1,
                total: images.length
            });
        }

        return pages;
    },

    downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async exportPdf(images, options, onProgress = () => { }) {
        const jsPdfNs = window.jspdf;
        if (!jsPdfNs || !jsPdfNs.jsPDF) {
            throw new Error('PDF 导出库未加载');
        }

        const spec = this.getRenderSpec('pdf', options.preset, options.orientation);
        const pages = await this.buildRenderedPages(images, {
            format: 'pdf',
            preset: options.preset,
            orientation: options.orientation,
            fit: options.fit
        }, onProgress);

        const pdf = new jsPdfNs.jsPDF({
            orientation: options.orientation,
            unit: 'mm',
            format: spec.formatName,
            compress: true
        });

        pages.forEach((page, index) => {
            if (index > 0) {
                pdf.addPage(spec.formatName, options.orientation);
            }

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            pdf.addImage(page.dataUrl, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
        });

        onProgress({ stage: 'write', current: images.length, total: images.length });
        pdf.save(`${this.sanitizeFileName(options.fileName)}.pdf`);
    },

    async exportWord(images, options, onProgress = () => { }) {
        if (!window.htmlDocx || typeof window.htmlDocx.asBlob !== 'function') {
            throw new Error('Word 导出库未加载');
        }

        const spec = this.getRenderSpec('word', 'document', options.orientation);
        const pages = await this.buildRenderedPages(images, {
            format: 'word',
            preset: 'document',
            orientation: options.orientation,
            fit: options.fit
        }, onProgress);

        const pageStyle = `width:${spec.widthMm}mm;height:${spec.heightMm}mm;`;
        const html = `
            <!doctype html>
            <html lang="zh-CN">
            <head>
                <meta charset="utf-8">
                <style>
                    html, body { margin: 0; padding: 0; background: #ffffff; }
                    .doc-page { ${pageStyle} page-break-after: always; }
                    .doc-page:last-child { page-break-after: auto; }
                    .doc-page img { display: block; width: 100%; height: 100%; }
                </style>
            </head>
            <body>
                ${pages.map((page) => `<section class="doc-page"><img src="${page.dataUrl}" alt=""></section>`).join('')}
            </body>
            </html>
        `;

        const blob = window.htmlDocx.asBlob(html, {
            orientation: options.orientation,
            margins: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                header: 0,
                footer: 0,
                gutter: 0
            }
        });

        onProgress({ stage: 'write', current: images.length, total: images.length });
        this.downloadBlob(blob, `${this.sanitizeFileName(options.fileName)}.docx`);
    },

    async exportPpt(images, options, onProgress = () => { }) {
        if (typeof window.PptxGenJS !== 'function') {
            throw new Error('PPT 导出库未加载');
        }

        const spec = this.getRenderSpec('ppt', options.preset, 'landscape');
        const pages = await this.buildRenderedPages(images, {
            format: 'ppt',
            preset: options.preset,
            orientation: 'landscape',
            fit: options.fit
        }, onProgress);

        const pptx = new window.PptxGenJS();
        pptx.layout = spec.layout;
        pptx.author = 'jiaoge';
        pptx.company = 'Image Studio';
        pptx.subject = 'Image Export';
        pptx.title = this.sanitizeFileName(options.fileName);

        pages.forEach((page) => {
            const slide = pptx.addSlide();
            slide.background = { color: 'FFFFFF' };
            slide.addImage({
                data: page.dataUrl,
                x: 0,
                y: 0,
                w: spec.slideWidthIn,
                h: spec.slideHeightIn
            });
        });

        onProgress({ stage: 'write', current: images.length, total: images.length });
        await pptx.writeFile({ fileName: `${this.sanitizeFileName(options.fileName)}.pptx` });
    },

    async export(images, options, onProgress = () => { }) {
        if (!Array.isArray(images) || images.length === 0) {
            throw new Error('没有可导出的图片');
        }

        if (options.format === 'pdf') {
            return this.exportPdf(images, options, onProgress);
        }

        if (options.format === 'word') {
            return this.exportWord(images, options, onProgress);
        }

        if (options.format === 'ppt') {
            return this.exportPpt(images, options, onProgress);
        }

        throw new Error('不支持的导出格式');
    }
};
