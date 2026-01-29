/**
 * Tools and Property Panels
 */

const toolManager = {
    currentTool: 'select',
    cropRect: null,
    cropOverlays: [],
    cropSizeLabel: null,
    aiBgState: null,
    idPhotoState: null,
    toHexColor(color) {
        if (!color) return '#000000';
        if (typeof color !== 'string') return '#000000';
        if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
        try {
            const c = new fabric.Color(color);
            return `#${c.toHex()}`;
        } catch (_) {
            return '#000000';
        }
    },

    activate(toolName) {
        // 检查 canvas 是否已初始化
        if (!window.canvas) {
            if (toolName !== 'select') {
                alert('请先打开或上传一张图片');
            }
            return;
        }

        // 如果点击的是当前已激活的工具，且不是'select'，则切换回'select'（实现取消当前工具的功能）
        // 排除支持连续操作的工具：shape（可添加多个形状）、text（可添加多个文字）、sticker（可添加多个贴纸）、image-watermark（可添加多个水印）
        if (this.currentTool === toolName && toolName !== 'select' && 
            toolName !== 'shape' && toolName !== 'text' && toolName !== 'sticker' && toolName !== 'image-watermark') {
            this.activate('select');
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            return;
        }

        const prevTool = this.currentTool;
        if (prevTool && prevTool !== toolName) {
            this._flattenLayersIfNeeded(prevTool);
        }

        this.currentTool = toolName;
        this.resetCanvasState();

        switch (toolName) {
            case 'select':
                canvas.isDrawingMode = false;
                canvas.selection = true;
                this.updatePropertyPanel('select');
                break;
            case 'mosaic':
                this.initMosaic();
                break;
            case 'grid-slice':
                this.initGridSlice();
                break;
            case 'id-photo':
                this.initIDPhoto();
                break;
            case 'ai-background':
                this.initAiBackground();
                break;
            case 'text':
                this.addText();
                break;
            case 'crop':
                this.initCrop();
                break;
            case 'resize':
                this.updatePropertyPanel('resize');
                break;
            case 'rotate':
                this.updatePropertyPanel('rotate');
                break;
            case 'filter':
                this.updatePropertyPanel('filter');
                break;
            case 'image-watermark':
                this.addImageWatermark();
                break;
            case 'shape':
                this.initShape();
                break;
            case 'icon-gen':
                this.initIconGenerator();
                break;
            case 'frame':
                this.initFrame();
                break;
            case 'remove-watermark':
                this.initRemoveWatermark();
                break;
            case 'sticker':
                this.initSticker();
                break;
            case 'ocr':
                this.initOCR();
                break;
            case 'ai-gen':
                this.initAIGen();
                break;
            case 'magic-eraser':
                this.initMagicEraser();
                break;
        }
    },

    resetCanvasState() {
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.skipTargetFind = false; // 重置为默认状态
        canvas.renderOnAddRemove = true; // 重置为默认状态

        // 移除裁剪框
        if (this.cropRect) {
            canvas.remove(this.cropRect);
            this.cropRect = null;
        }

        // 移除所有遮罩层
        this.cropOverlays.forEach(overlay => canvas.remove(overlay));
        this.cropOverlays = [];

        // 移除网格线
        if (this.cropGridLines) {
            this.cropGridLines.forEach(line => canvas.remove(line));
            this.cropGridLines = [];
        }

        // 移除尺寸标签
        if (this.cropSizeLabel) {
            canvas.remove(this.cropSizeLabel);
            this.cropSizeLabel = null;
        }

        // 清理马赛克相关事件监听器
        canvas.off('mouse:down', this._mosaicMouseDownHandler);
        canvas.off('mouse:move', this._mosaicMouseMoveHandler);
        canvas.off('mouse:up', this._mosaicMouseUpHandler);
        canvas.off('mouse:out', this._mosaicMouseOutHandler);

        // 清理消除笔相关元素
        this.cleanupMagicEraser();

        canvas.forEachObject(obj => {
            if (obj.selectable === false && obj.evented === false) return;
            obj.selectable = true;
            obj.evented = true;
        });
    },

    _flattenLayersIfNeeded(prevTool) {
        if (prevTool !== 'ai-background' && prevTool !== 'id-photo') return;

        const objects = canvas.getObjects();
        const images = objects.filter(o => o.type === 'image');

        if (prevTool === 'ai-background') {
            if (objects.length !== 2 || images.length !== 2) return;
            const hasLockedBg = images.some(i => i.selectable === false && i.evented === false);
            const hasPortrait = images.some(i => i.selectable === true && i.evented === true);
            if (!hasLockedBg || !hasPortrait) return;
        }

        if (prevTool === 'id-photo') {
            if (objects.length !== 2) return;
            const hasLockedRect = objects.some(o => o.type === 'rect' && o.selectable === false && o.evented === false);
            const hasPortrait = objects.some(o => o.type === 'image' && o.selectable === true && o.evented === true);
            if (!hasLockedRect || !hasPortrait) return;
        }

        const flattenedEl = canvas.toCanvasElement();
        const flattenedImg = new fabric.Image(flattenedEl, { left: 0, top: 0 });
        flattenedImg.isInternal = true;

        const w = canvas.width;
        const h = canvas.height;
        canvas.clear();
        canvas.setDimensions({ width: w, height: h });
        canvas.add(flattenedImg);
        canvas.sendToBack(flattenedImg);
        canvas.renderAll();
        historyManager.push(canvas);

        if (prevTool === 'ai-background') this.aiBgState = null;
        if (prevTool === 'id-photo') this.idPhotoState = null;
    },

    initCrop() {
        // 获取画布中的第一个图片对象
        const objects = canvas.getObjects();
        const baseImage = objects.find(obj => obj.type === 'image');

        if (!baseImage) {
            alert('请先导入图片');
            return;
        }

        // 禁止选择其他对象
        canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = false;
        });

        // 获取图片的实际位置和尺寸
        const imgLeft = baseImage.left;
        const imgTop = baseImage.top;
        const imgWidth = baseImage.width * baseImage.scaleX;
        const imgHeight = baseImage.height * baseImage.scaleY;

        // 创建裁剪框（默认占图片的 100%）
        const cropWidth = imgWidth;
        const cropHeight = imgHeight;
        const cropLeft = imgLeft;
        const cropTop = imgTop;

        // 创建四个遮罩矩形（上、下、左、右）
        const topOverlay = new fabric.Rect({
            left: imgLeft, top: imgTop, width: imgWidth, height: 0,
            fill: 'rgba(0, 0, 0, 0.6)', selectable: false, evented: false, excludeFromExport: true
        });
        const bottomOverlay = new fabric.Rect({
            left: imgLeft, top: imgTop + imgHeight, width: imgWidth, height: 0,
            fill: 'rgba(0, 0, 0, 0.6)', selectable: false, evented: false, excludeFromExport: true
        });
        const leftOverlay = new fabric.Rect({
            left: imgLeft, top: imgTop, width: 0, height: imgHeight,
            fill: 'rgba(0, 0, 0, 0.6)', selectable: false, evented: false, excludeFromExport: true
        });
        const rightOverlay = new fabric.Rect({
            left: imgLeft + imgWidth, top: imgTop, width: 0, height: imgHeight,
            fill: 'rgba(0, 0, 0, 0.6)', selectable: false, evented: false, excludeFromExport: true
        });

        this.cropOverlays = [topOverlay, bottomOverlay, leftOverlay, rightOverlay];
        this.cropOverlays.forEach(overlay => canvas.add(overlay));

        // Create Grid Lines (4x4)
        this.cropGridLines = [];
        for (let i = 1; i <= 3; i++) {
            // Vertical lines
            this.cropGridLines.push(new fabric.Line([0, 0, 0, 0], {
                stroke: 'rgba(255, 255, 255, 0.5)', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true
            }));
            // Horizontal lines
            this.cropGridLines.push(new fabric.Line([0, 0, 0, 0], {
                stroke: 'rgba(255, 255, 255, 0.5)', strokeWidth: 1, selectable: false, evented: false, excludeFromExport: true
            }));
        }
        this.cropGridLines.forEach(line => canvas.add(line));


        // 创建裁剪框
        this.cropRect = new fabric.Rect({
            left: cropLeft,
            top: cropTop,
            width: cropWidth,
            height: cropHeight,
            fill: 'rgba(0, 0, 0, 0)',
            stroke: 'white',
            strokeWidth: 2,
            selectable: true,
            hasControls: true,
            hasBorders: true,
            lockRotation: true,
            cornerColor: 'white',
            cornerSize: 10,
            transparentCorners: false,
            borderColor: 'white',
            cornerStyle: 'circle',
            borderDashArray: [5, 5]
        });

        // 创建尺寸标签
        this.cropSizeLabel = new fabric.Text(`${Math.round(cropWidth)} x ${Math.round(cropHeight)}`, {
            left: cropLeft + cropWidth / 2,
            top: cropTop + cropHeight + 10,
            fontSize: 14,
            fill: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: 5,
            selectable: false,
            evented: false,
            originX: 'center',
            excludeFromExport: true
        });

        canvas.add(this.cropRect);
        canvas.add(this.cropSizeLabel);
        canvas.setActiveObject(this.cropRect);

        // 监听裁剪框的移动和缩放，更新遮罩和尺寸标签
        const updateCropOverlays = () => {
            const rect = this.cropRect;
            const rectLeft = rect.left;
            const rectTop = rect.top;
            const rectWidth = rect.width * rect.scaleX;
            const rectHeight = rect.height * rect.scaleY;

            // 限制裁剪框不超出图片范围
            let newLeft = rectLeft;
            let newTop = rectTop;

            if (rectLeft < imgLeft) newLeft = imgLeft;
            if (rectTop < imgTop) newTop = imgTop;
            if (rectLeft + rectWidth > imgLeft + imgWidth) {
                newLeft = imgLeft + imgWidth - rectWidth;
            }
            if (rectTop + rectHeight > imgTop + imgHeight) {
                newTop = imgTop + imgHeight - rectHeight;
            }

            if (newLeft !== rectLeft || newTop !== rectTop) {
                rect.set({ left: newLeft, top: newTop });
            }

            const finalLeft = rect.left;
            const finalTop = rect.top;
            const finalWidth = rect.width * rect.scaleX;
            const finalHeight = rect.height * rect.scaleY;

            // 更新四个遮罩
            topOverlay.set({
                left: imgLeft, top: imgTop, width: imgWidth, height: finalTop - imgTop
            });
            bottomOverlay.set({
                left: imgLeft, top: finalTop + finalHeight, width: imgWidth, height: imgTop + imgHeight - (finalTop + finalHeight)
            });
            leftOverlay.set({
                left: imgLeft, top: finalTop, width: finalLeft - imgLeft, height: finalHeight
            });
            rightOverlay.set({
                left: finalLeft + finalWidth, top: finalTop, width: imgLeft + imgWidth - (finalLeft + finalWidth), height: finalHeight
            });

            // Update Grid Lines (4x4 grid: 25%, 50%, 75%)
            // V1 (25%)
            this.cropGridLines[0].set({ x1: finalLeft + finalWidth * 0.25, y1: finalTop, x2: finalLeft + finalWidth * 0.25, y2: finalTop + finalHeight });
            // H1 (25%)
            this.cropGridLines[1].set({ x1: finalLeft, y1: finalTop + finalHeight * 0.25, x2: finalLeft + finalWidth, y2: finalTop + finalHeight * 0.25 });
            // V2 (50%)
            this.cropGridLines[2].set({ x1: finalLeft + finalWidth * 0.5, y1: finalTop, x2: finalLeft + finalWidth * 0.5, y2: finalTop + finalHeight });
            // H2 (50%)
            this.cropGridLines[3].set({ x1: finalLeft, y1: finalTop + finalHeight * 0.5, x2: finalLeft + finalWidth, y2: finalTop + finalHeight * 0.5 });
            // V3 (75%)
            this.cropGridLines[4].set({ x1: finalLeft + finalWidth * 0.75, y1: finalTop, x2: finalLeft + finalWidth * 0.75, y2: finalTop + finalHeight });
            // H3 (75%)
            this.cropGridLines[5].set({ x1: finalLeft, y1: finalTop + finalHeight * 0.75, x2: finalLeft + finalWidth, y2: finalTop + finalHeight * 0.75 });


            // 更新尺寸标签
            this.cropSizeLabel.set({
                text: `${Math.round(finalWidth)} x ${Math.round(finalHeight)}`,
                left: finalLeft + finalWidth / 2,
                top: finalTop + finalHeight + 10
            });

            canvas.renderAll();
        };

        this.cropRect.on('moving', updateCropOverlays);
        this.cropRect.on('scaling', updateCropOverlays);
        this.cropRect.on('modified', updateCropOverlays);

        // Initial update to place grid lines correctly
        updateCropOverlays();

        canvas.renderAll();
        this.updatePropertyPanel('crop');
    },

    applyCrop() {
        if (!this.cropRect) return;

        // 获取裁剪区域
        const left = this.cropRect.left;
        const top = this.cropRect.top;
        const width = this.cropRect.width * this.cropRect.scaleX;
        const height = this.cropRect.height * this.cropRect.scaleY;

        // 移除遮罩、裁剪框和标签
        this.cropOverlays.forEach(overlay => canvas.remove(overlay));
        this.cropOverlays = [];
        if (this.cropGridLines) {
            this.cropGridLines.forEach(line => canvas.remove(line));
            this.cropGridLines = [];
        }
        canvas.remove(this.cropRect);
        canvas.remove(this.cropSizeLabel);

        // 导出裁剪区域为图片
        const croppedDataURL = canvas.toDataURL({
            left: left,
            top: top,
            width: width,
            height: height,
            format: 'png'
        });

        // 重新加载裁剪后的图片
        fabric.Image.fromURL(croppedDataURL, (img) => {
            canvas.clear();
            canvas.setDimensions({ width: width, height: height });
            canvas.add(img);
            canvas.renderAll();

            this.cropRect = null;
            this.cropSizeLabel = null;
            historyManager.push(canvas);
            this.updatePropertyPanel('select');
        });
    },

    setCropRatio(ratio) {
        if (!this.cropRect) return;

        const currentWidth = this.cropRect.width * this.cropRect.scaleX;
        let newHeight;

        switch (ratio) {
            case '1:1':
                newHeight = currentWidth;
                break;
            case '3:4':
                newHeight = currentWidth * 4 / 3;
                break;
            case '4:3':
                newHeight = currentWidth * 3 / 4;
                break;
            case '9:16':
                newHeight = currentWidth * 16 / 9;
                break;
            case '16:9':
                newHeight = currentWidth * 9 / 16;
                break;
            case 'free':
                return;
        }

        this.cropRect.set({
            height: newHeight / this.cropRect.scaleY,
            scaleY: 1
        });

        this.cropRect.fire('modified');
        canvas.renderAll();
    },

    initGridSlice() {
        const objects = canvas.getObjects();
        const baseImage = objects.find(obj => obj.type === 'image');

        if (!baseImage) {
            alert('请先导入图片');
            this.activate('select');
            return;
        }

        this.updatePropertyPanel('grid-slice');
    },

    async applyGridSlice(rows, cols) {
        if (!rows || !cols || rows <= 0 || cols <= 0) {
            alert('请输入有效的行数和列数');
            return;
        }

        const objects = canvas.getObjects();
        const baseImage = objects.find(obj => obj.type === 'image');
        if (!baseImage) return;

        // 获取图片的实际渲染位置和尺寸
        // 注意：这里我们使用 canvas 的尺寸，因为用户可能已经进行了缩放或裁剪
        const totalWidth = canvas.width;
        const totalHeight = canvas.height;

        const sliceWidth = totalWidth / cols;
        const sliceHeight = totalHeight / rows;

        const zip = new JSZip();
        const imgFolder = zip.folder("sliced_images");

        const btn = document.getElementById('apply-grid-slice');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '处理中...';

        try {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const left = c * sliceWidth;
                    const top = r * sliceHeight;

                    const dataURL = canvas.toDataURL({
                        left: left,
                        top: top,
                        width: sliceWidth,
                        height: sliceHeight,
                        format: 'png',
                        quality: 1
                    });

                    // 去掉 data:image/png;base64, 前缀
                    const base64Data = dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
                    imgFolder.file(`slice_${r + 1}_${c + 1}.png`, base64Data, { base64: true });
                }
            }

            const content = await zip.generateAsync({ type: "blob" });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = `sliced_images_${rows}x${cols}.zip`;
            link.click();

            alert('切图完成并已打包下载！');
        } catch (error) {
            console.error('切图失败:', error);
            alert('切图过程中出错，请稍后重试。');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    initAiBackground() {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先导入图片');
            this.activate('select');
            return;
        }
        canvas.selection = true;
        const images = canvas.getObjects().filter(o => o.type === 'image');
        const portrait = images.find(i => i.selectable === true && i.evented === true);
        if (portrait) canvas.setActiveObject(portrait);
        this.updatePropertyPanel('ai-background');
    },

    initIDPhoto() {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先导入图片');
            this.activate('select');
            return;
        }
        canvas.selection = true;
        const portrait = canvas.getObjects().find(o => o.type === 'image' && o.selectable === true && o.evented === true);
        if (portrait) canvas.setActiveObject(portrait);
        this.updatePropertyPanel('id-photo');
    },

    async _ensureAIModel() {
        if (this.selfieSegmentation) return;

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            const requiredFiles = [
                'lib/mediapipe/selfie_segmentation.tflite',
                'lib/mediapipe/selfie_segmentation.binarypb',
                'lib/mediapipe/selfie_segmentation_solution_wasm_bin.wasm',
                'lib/mediapipe/selfie_segmentation_solution_simd_wasm_bin.wasm',
                'lib/mediapipe/selfie_segmentation_solution_wasm_bin.js',
                'lib/mediapipe/selfie_segmentation_solution_simd_wasm_bin.js',
            ];
            for (const filePath of requiredFiles) {
                const url = chrome.runtime.getURL(filePath);
                try {
                    const response = await fetch(url);
                    if (!response.ok) {
                        throw new Error(`${filePath} (Status: ${response.status})`);
                    }
                } catch (e) {
                    console.error('[AI] Fetch failed:', filePath, e);
                    throw new Error(`无法加载 AI 资源：${filePath}`);
                }
            }
        }

        if (typeof SelfieSegmentation === 'undefined') {
            throw new Error('AI 组件 SelfieSegmentation 未定义，请检查脚本引入。');
        }

        this.selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) => {
                const path = `lib/mediapipe/${file}`;
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    try {
                        return chrome.runtime.getURL(path);
                    } catch (e) {
                        console.error(`[AI] Failed to resolve URL for ${path}:`, e);
                    }
                }
                return path;
            }
        });
        this.selfieSegmentation.setOptions({
            modelSelection: 0,
            selfieMode: false,
        });
    },

    async _runSegmentation(imgElement) {
        const results = await new Promise((resolve, reject) => {
            let isResolved = false;

            this.selfieSegmentation.onResults((res) => {
                if (isResolved) return;
                isResolved = true;
                resolve(res);
            });

            this.selfieSegmentation.send({ image: imgElement })
                .catch(err => {
                    if (isResolved) return;
                    isResolved = true;
                    reject(err);
                });

            setTimeout(() => {
                if (isResolved) return;
                isResolved = true;
                reject(new Error('AI 处理超时，请重试。'));
            }, 15000);
        });

        return results;
    },

    _renderAiBackgroundComposite(scalePct, pushHistory = false, showAlert = false) {
        if (!this.aiBgState) return;

        const { bgCanvas, portraitCanvas } = this.aiBgState;
        const scale = Math.max(0.5, Math.min(2.0, (scalePct || 100) / 100));

        const images = canvas.getObjects().filter(o => o.type === 'image');
        const existingBg = images.find(i => i.selectable === false && i.evented === false);
        const existingPortrait = images.find(i => i.selectable === true && i.evented === true);

        if (images.length === 2 && existingBg && existingPortrait) {
            existingBg.setElement(bgCanvas);
            existingBg.dirty = true;
            canvas.renderAll();
            if (pushHistory) historyManager.push(canvas);
            if (showAlert) alert('背景替换成功！');
            return;
        }

        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) return;

        const center = baseImage.getCenterPoint();
        const common = {
            left: center.x,
            top: center.y,
            originX: 'center',
            originY: 'center',
            angle: baseImage.angle,
            flipX: baseImage.flipX,
            flipY: baseImage.flipY
        };

        const bgImg = new fabric.Image(bgCanvas, {
            ...common,
            scaleX: baseImage.scaleX,
            scaleY: baseImage.scaleY,
            selectable: false,
            evented: false
        });
        bgImg.isInternal = true;

        const portraitImg = new fabric.Image(portraitCanvas, {
            ...common,
            scaleX: baseImage.scaleX * scale,
            scaleY: baseImage.scaleY * scale,
            selectable: true,
            evented: true,
            lockRotation: true
        });
        portraitImg.isInternal = true;

        canvas.remove(baseImage);
        canvas.add(bgImg);
        canvas.add(portraitImg);
        canvas.sendToBack(bgImg);
        canvas.setActiveObject(portraitImg);
        canvas.renderAll();
        if (pushHistory) historyManager.push(canvas);
        if (showAlert) alert('背景替换成功！');
    },

    async applyAiBackground(type, value, personScalePct = 100) {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage && !this.aiBgState) return;

        const btn = document.getElementById('btn-apply-ai');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'AI 识别中...';

        try {
            console.log('开始 AI 处理，类型:', type);
            await this._ensureAIModel();

            if (this.aiBgState && this.aiBgState.bgCanvas && this.aiBgState.portraitCanvas) {
                const { width, height, bgCanvas } = this.aiBgState;
                const bgCtx = bgCanvas.getContext('2d');
                bgCtx.clearRect(0, 0, width, height);

                if (type === 'color') {
                    bgCtx.fillStyle = value;
                    bgCtx.fillRect(0, 0, width, height);
                } else if (type === 'image') {
                    bgCtx.drawImage(value, 0, 0, width, height);
                }

                this.aiBgState.lastScalePct = personScalePct;
                this._renderAiBackgroundComposite(personScalePct, true, true);
                return;
            }

            const imgElement = baseImage._element;
            const results = await this._runSegmentation(imgElement);

            if (!results || !results.segmentationMask) {
                throw new Error('AI 无法识别图片中的人像');
            }

            const width = imgElement.naturalWidth || imgElement.width;
            const height = imgElement.naturalHeight || imgElement.height;

            const portraitCanvas = document.createElement('canvas');
            const portraitCtx = portraitCanvas.getContext('2d');
            portraitCanvas.width = width;
            portraitCanvas.height = height;

            portraitCtx.drawImage(imgElement, 0, 0, width, height);
            portraitCtx.globalCompositeOperation = 'destination-in';
            portraitCtx.drawImage(results.segmentationMask, 0, 0, width, height);
            portraitCtx.globalCompositeOperation = 'source-over';

            const bgCanvas = document.createElement('canvas');
            const bgCtx = bgCanvas.getContext('2d');
            bgCanvas.width = width;
            bgCanvas.height = height;

            if (type === 'color') {
                bgCtx.fillStyle = value;
                bgCtx.fillRect(0, 0, width, height);
            } else if (type === 'image') {
                bgCtx.drawImage(value, 0, 0, width, height);
            }

            this.aiBgState = {
                width,
                height,
                bgCanvas,
                portraitCanvas,
                lastScalePct: personScalePct
            };

            this._renderAiBackgroundComposite(personScalePct, true, true);

        } catch (error) {
            console.error('AI 处理详细错误:', error);
            alert(`AI 处理失败: ${error.message || '未知错误'}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    _getIDPhotoTemplates() {
        return {
            small_1inch: { label: '小一寸 (22×32mm)', width: 260, height: 378, headroomRatio: 0.12, personHeightRatio: 0.82 },
            inch_1: { label: '一寸 (25×35mm)', width: 295, height: 413, headroomRatio: 0.12, personHeightRatio: 0.80 },
            big_1inch: { label: '大一寸 (33×48mm)', width: 390, height: 567, headroomRatio: 0.11, personHeightRatio: 0.76 },
            inch_2: { label: '二寸 (35×49mm)', width: 413, height: 579, headroomRatio: 0.11, personHeightRatio: 0.74 },
        };
    },

    _computeMaskBoundingBox(segmentationMask, width, height) {
        const maskCanvas = document.createElement('canvas');
        const maskCtx = maskCanvas.getContext('2d');
        maskCanvas.width = width;
        maskCanvas.height = height;
        maskCtx.drawImage(segmentationMask, 0, 0, width, height);

        const { data } = maskCtx.getImageData(0, 0, width, height);
        const threshold = 128;
        const step = 2;

        let minX = width, minY = height, maxX = -1, maxY = -1;
        for (let y = 0; y < height; y += step) {
            const rowOffset = y * width * 4;
            for (let x = 0; x < width; x += step) {
                const i = rowOffset + x * 4;
                const v = data[i];
                if (v >= threshold) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX < 0 || maxY < 0) return null;
        return { minX, minY, maxX, maxY };
    },

    async generateIDPhoto(sizeKey, bgColor, personScalePct = 100) {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) return;

        const templates = this._getIDPhotoTemplates();
        const template = templates[sizeKey];
        if (!template) {
            alert('请选择有效的证件照尺寸');
            return;
        }

        const btn = document.getElementById('btn-generate-id-photo');
        const originalText = btn?.textContent;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '生成中...';
        }

        try {
            await this._ensureAIModel();

            const imgElement = baseImage._element;
            const results = await this._runSegmentation(imgElement);
            if (!results || !results.segmentationMask) {
                throw new Error('AI 无法识别图片中的人像');
            }

            const srcW = imgElement.naturalWidth || imgElement.width;
            const srcH = imgElement.naturalHeight || imgElement.height;

            const bbox = this._computeMaskBoundingBox(results.segmentationMask, srcW, srcH);
            if (!bbox) {
                throw new Error('无法定位人像区域，请换一张更清晰的照片');
            }

            const portraitCanvas = document.createElement('canvas');
            const portraitCtx = portraitCanvas.getContext('2d');
            portraitCanvas.width = srcW;
            portraitCanvas.height = srcH;
            portraitCtx.drawImage(imgElement, 0, 0, srcW, srcH);
            portraitCtx.globalCompositeOperation = 'destination-in';
            portraitCtx.drawImage(results.segmentationMask, 0, 0, srcW, srcH);
            portraitCtx.globalCompositeOperation = 'source-over';

            this.idPhotoState = {
                template,
                bgColor,
                portraitCanvas,
                bbox,
                srcW,
                srcH,
                sizeKey,
                lastScalePct: personScalePct
            };

            canvas.clear();
            canvas.setDimensions({ width: template.width, height: template.height });
            this._renderIDPhotoComposite(personScalePct, true);
            alert('证件照已生成！');

        } catch (error) {
            console.error('证件照生成失败:', error);
            alert(`证件照生成失败: ${error.message || '未知错误'}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    _renderIDPhotoComposite(scalePct, pushHistory = false) {
        if (!this.idPhotoState) return;

        const {
            template,
            bgColor,
            portraitCanvas,
            bbox,
            srcW,
            srcH,
            sizeKey
        } = this.idPhotoState;

        canvas.clear();
        canvas.setDimensions({ width: template.width, height: template.height });

        const bgRect = new fabric.Rect({
            left: 0,
            top: 0,
            width: template.width,
            height: template.height,
            fill: bgColor,
            selectable: false,
            evented: false
        });
        bgRect.isInternal = true;

        const userScale = Math.max(0.5, Math.min(2.0, (scalePct || 100) / 100));
        const targetHeadroom = template.height * (template.headroomRatio ?? 0.12);
        const targetPersonHeight = template.height * (template.personHeightRatio ?? 0.78);

        const padX = Math.max(2, Math.round(srcW * 0.02));
        const padY = Math.max(2, Math.round(srcH * 0.02));
        const cropX = Math.max(0, bbox.minX - padX);
        const cropY = Math.max(0, bbox.minY - padY);
        const cropMaxX = Math.min(srcW - 1, bbox.maxX + padX);
        const cropMaxY = Math.min(srcH - 1, bbox.maxY + padY);
        const cropW = cropMaxX - cropX + 1;
        const cropH = cropMaxY - cropY + 1;

        const tightCanvas = document.createElement('canvas');
        const tightCtx = tightCanvas.getContext('2d');
        tightCanvas.width = cropW;
        tightCanvas.height = cropH;
        tightCtx.drawImage(portraitCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        const localBbox = {
            minX: bbox.minX - cropX,
            minY: bbox.minY - cropY,
            maxX: bbox.maxX - cropX,
            maxY: bbox.maxY - cropY
        };

        const bboxH = localBbox.maxY - localBbox.minY + 1;
        const baseScale = targetPersonHeight / bboxH;
        const scale = baseScale * userScale;

        const centerX = (localBbox.minX + localBbox.maxX) / 2;
        let x = template.width / 2 - centerX * scale;
        let y = targetHeadroom - localBbox.minY * scale;

        const marginX = template.width * 0.08;
        const marginTop = template.height * 0.06;
        const marginBottom = template.height * 0.98;

        const bboxLeft = x + localBbox.minX * scale;
        const bboxRight = x + localBbox.maxX * scale;
        if (bboxLeft < marginX) x += (marginX - bboxLeft);
        if (bboxRight > template.width - marginX) x -= (bboxRight - (template.width - marginX));

        const bboxTop = y + localBbox.minY * scale;
        const bboxBottom = y + localBbox.maxY * scale;
        if (bboxTop < marginTop) y += (marginTop - bboxTop);
        if (bboxBottom > marginBottom) y -= (bboxBottom - marginBottom);

        const portraitImg = new fabric.Image(tightCanvas, {
            left: x,
            top: y,
            originX: 'left',
            originY: 'top',
            scaleX: scale,
            scaleY: scale,
            selectable: true,
            evented: true,
            lockRotation: true
        });
        portraitImg.isInternal = true;

        canvas.add(bgRect);
        canvas.add(portraitImg);
        canvas.sendToBack(bgRect);
        canvas.setActiveObject(portraitImg);
        canvas.renderAll();
        if (pushHistory) historyManager.push(canvas);
    },

    initMosaic() {
        // 确保画布可以接收鼠标事件
        canvas.isDrawingMode = false;
        canvas.selection = false;
        canvas.skipTargetFind = true; // 跳过目标查找，直接处理鼠标事件
        canvas.renderOnAddRemove = false; // 暂时禁用自动渲染

        // 将 mosaicBrush 保存为 toolManager 的属性，以便在属性面板中访问
        this.mosaicBrush = {
            width: 20,
            blockSize: 10,
            blurRadius: 5,
            frostedOpacity: 0.7,
            type: 'pixel', // 'pixel', 'blur', 'frosted'
            isDrawing: false,
            lastPointer: null,
            _offscreenCanvas: null,
            _offscreenCtx: null,
            _tempCanvas: null, // 用于高斯模糊的临时画布

            // 初始化离屏画布
            _initOffscreen: function () {
                if (!this._offscreenCanvas) {
                    this._offscreenCanvas = document.createElement('canvas');
                    this._offscreenCtx = this._offscreenCanvas.getContext('2d');
                    this._tempCanvas = document.createElement('canvas');
                }
                // 同步尺寸
                this._offscreenCanvas.width = canvas.width;
                this._offscreenCanvas.height = canvas.height;
                this._tempCanvas.width = canvas.width;
                this._tempCanvas.height = canvas.height;
                // 将当前 Fabric.js 画布内容渲染到离屏画布
                const dataUrl = canvas.toDataURL({ format: 'png' });
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        this._offscreenCtx.clearRect(0, 0, this._offscreenCanvas.width, this._offscreenCanvas.height);
                        this._offscreenCtx.drawImage(img, 0, 0);
                        resolve();
                    };
                    img.src = dataUrl;
                });
            },

            _addMosaic: function (pointer) {
                if (!this._offscreenCtx) return;

                const ctx = this._offscreenCtx;
                const halfWidth = this.width / 2;

                const left = Math.max(0, Math.floor(pointer.x - halfWidth));
                const top = Math.max(0, Math.floor(pointer.y - halfWidth));
                const right = Math.min(canvas.width, Math.ceil(pointer.x + halfWidth));
                const bottom = Math.min(canvas.height, Math.ceil(pointer.y + halfWidth));

                const w = right - left;
                const h = bottom - top;
                if (w <= 0 || h <= 0) return;

                try {
                    switch (this.type) {
                        case 'pixel':
                            this._applyPixelMosaic(ctx, left, top, w, h);
                            break;
                        case 'blur':
                            this._applyBlurMosaic(ctx, left, top, w, h);
                            break;
                        case 'frosted':
                            this._applyFrostedMosaic(ctx, left, top, w, h);
                            break;
                    }

                    // 实时更新显示：将离屏画布的内容更新到 Fabric.js 画布
                    this._updateFabricCanvas();
                } catch (e) {
                    console.error('马赛克处理错误:', e);
                }
            },

            // 纯色块马赛克（像素化）
            _applyPixelMosaic: function (ctx, left, top, w, h) {
                const imageData = ctx.getImageData(left, top, w, h);
                const data = imageData.data;

                for (let y = 0; y < h; y += this.blockSize) {
                    for (let x = 0; x < w; x += this.blockSize) {
                        let r = 0, g = 0, b = 0, count = 0;

                        for (let dy = 0; dy < this.blockSize && y + dy < h; dy++) {
                            for (let dx = 0; dx < this.blockSize && x + dx < w; dx++) {
                                const idx = ((y + dy) * w + (x + dx)) * 4;
                                r += data[idx];
                                g += data[idx + 1];
                                b += data[idx + 2];
                                count++;
                            }
                        }

                        r = Math.round(r / count);
                        g = Math.round(g / count);
                        b = Math.round(b / count);

                        for (let dy = 0; dy < this.blockSize && y + dy < h; dy++) {
                            for (let dx = 0; dx < this.blockSize && x + dx < w; dx++) {
                                const idx = ((y + dy) * w + (x + dx)) * 4;
                                data[idx] = r;
                                data[idx + 1] = g;
                                data[idx + 2] = b;
                            }
                        }
                    }
                }

                ctx.putImageData(imageData, left, top);
            },

            // 高斯模糊马赛克
            _applyBlurMosaic: function (ctx, left, top, w, h) {
                // 使用临时画布进行模糊处理
                const tempCtx = this._tempCanvas.getContext('2d');
                
                // 清除临时画布的对应区域
                tempCtx.clearRect(0, 0, this._tempCanvas.width, this._tempCanvas.height);
                
                // 将当前离屏画布内容复制到临时画布
                tempCtx.drawImage(this._offscreenCanvas, 0, 0);
                
                // 应用高斯模糊
                tempCtx.filter = `blur(${this.blurRadius}px)`;
                tempCtx.drawImage(this._offscreenCanvas, left, top, w, h, left, top, w, h);
                tempCtx.filter = 'none';
                
                // 将模糊后的区域复制回主画布
                const blurredData = tempCtx.getImageData(left, top, w, h);
                ctx.putImageData(blurredData, left, top);
            },

            // 毛玻璃效果马赛克
            _applyFrostedMosaic: function (ctx, left, top, w, h) {
                // 首先应用高斯模糊
                this._applyBlurMosaic(ctx, left, top, w, h);
                
                // 然后添加噪点和半透明白色覆盖层
                const imageData = ctx.getImageData(left, top, w, h);
                const data = imageData.data;
                
                const opacity = this.frostedOpacity;
                const noiseIntensity = 20; // 噪点强度
                
                for (let i = 0; i < data.length; i += 4) {
                    // 添加随机噪点
                    const noise = (Math.random() - 0.5) * noiseIntensity;
                    
                    // 混合白色（毛玻璃效果）
                    data[i] = Math.min(255, data[i] + noise + (255 - data[i]) * (1 - opacity) * 0.3);
                    data[i + 1] = Math.min(255, data[i + 1] + noise + (255 - data[i + 1]) * (1 - opacity) * 0.3);
                    data[i + 2] = Math.min(255, data[i + 2] + noise + (255 - data[i + 2]) * (1 - opacity) * 0.3);
                }
                
                ctx.putImageData(imageData, left, top);
            },

            _updateFabricCanvas: function () {
                // 把离屏画布的当前状态绘制到 Fabric.js 的下层画布上
                const lowerCanvas = canvas.lowerCanvasEl;
                const lowerCtx = lowerCanvas.getContext('2d');
                lowerCtx.clearRect(0, 0, lowerCanvas.width, lowerCanvas.height);
                lowerCtx.drawImage(this._offscreenCanvas, 0, 0);
            },

            // 完成绘制后，将结果应用为 Fabric.js 对象
            _applyToFabric: function () {
                const dataUrl = this._offscreenCanvas.toDataURL('image/png');
                fabric.Image.fromURL(dataUrl, (img) => {
                    // 清除画布上的所有对象
                    canvas.clear();
                    // 添加新图片
                    img.set({
                        left: 0,
                        top: 0,
                        selectable: true,
                        evented: true
                    });
                    canvas.add(img);
                    canvas.renderAll();
                });
            }
        };

        const mosaicBrush = this.mosaicBrush;

        // 保存事件监听器引用以便后续清理
        this._mosaicMouseDownHandler = async (e) => {
            // 先初始化离屏画布
            await mosaicBrush._initOffscreen();
            mosaicBrush.isDrawing = true;
            const pointer = canvas.getPointer(e.e);
            mosaicBrush._addMosaic(pointer);
        };

        this._mosaicMouseMoveHandler = (e) => {
            if (!mosaicBrush.isDrawing) return;
            const pointer = canvas.getPointer(e.e);
            mosaicBrush._addMosaic(pointer);
        };

        this._mosaicMouseUpHandler = () => {
            if (mosaicBrush.isDrawing) {
                mosaicBrush.isDrawing = false;
                // 将马赛克结果应用回 Fabric.js 画布
                mosaicBrush._applyToFabric();
                // 延迟推送历史记录，等待图片加载完成
                setTimeout(() => {
                    historyManager.push(canvas);
                }, 100);
            }
        };

        this._mosaicMouseOutHandler = () => {
            mosaicBrush.isDrawing = false;
        };

        // 使用 Fabric.js 的事件系统
        canvas.on('mouse:down', this._mosaicMouseDownHandler);
        canvas.on('mouse:move', this._mosaicMouseMoveHandler);
        canvas.on('mouse:up', this._mosaicMouseUpHandler);
        canvas.on('mouse:out', this._mosaicMouseOutHandler);

        // 先更新属性面板
        this.updatePropertyPanel('mosaic');
    },

    addText() {
        const fontStacks = this._getFontStacks();
        const text = new fabric.IText('输入文字...', {
            left: 100,
            top: 100,
            fontSize: 40,
            fill: '#ffffff',
            fontFamily: fontStacks.default
        });
        canvas.add(text);
        canvas.setActiveObject(text);
    },

    // ========== 全图平铺水印功能 ==========
    applyTiledWatermark(textContent, fontFamily, color, opacity, fontSize, angle, spacing) {
        // 获取画布尺寸
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // 创建离屏画布
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = canvasWidth;
        offscreenCanvas.height = canvasHeight;
        const ctx = offscreenCanvas.getContext('2d');

        // 设置文字样式
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.globalAlpha = opacity;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // 计算文字尺寸
        const textMetrics = ctx.measureText(textContent);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;

        // 计算旋转后需要覆盖的范围（扩展画布对角线长度以确保全覆盖）
        const diagonal = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight);
        const angleRad = (angle * Math.PI) / 180;

        // 保存画布状态
        ctx.save();

        // 将原点移动到画布中心
        ctx.translate(canvasWidth / 2, canvasHeight / 2);

        // 旋转画布
        ctx.rotate(angleRad);

        // 计算需要绘制的行列数（确保覆盖整个旋转后的区域）
        const stepX = textWidth + spacing;
        const stepY = textHeight + spacing;
        const cols = Math.ceil(diagonal / stepX) + 2;
        const rows = Math.ceil(diagonal / stepY) + 2;

        // 从中心向四周绘制水印
        for (let row = -rows; row <= rows; row++) {
            for (let col = -cols; col <= cols; col++) {
                const x = col * stepX;
                const y = row * stepY;
                ctx.fillText(textContent, x, y);
            }
        }

        // 恢复画布状态
        ctx.restore();

        // 将离屏画布转换为 fabric.Image 并添加到主画布
        const watermarkDataUrl = offscreenCanvas.toDataURL('image/png');
        fabric.Image.fromURL(watermarkDataUrl, (watermarkImg) => {
            watermarkImg.set({
                left: 0,
                top: 0,
                selectable: true,
                evented: true,
                // 标记为水印图层，便于识别
                isWatermarkLayer: true
            });
            canvas.add(watermarkImg);
            canvas.renderAll();
            historyManager.push(canvas);
        });
    },

    // 安全字体栈定义，确保跨平台兼容
    _getFontStacks() {
        return {
            // 系统默认 - 最安全的无衬线字体栈
            default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
            // 黑体 - 中文无衬线字体
            heiti: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif',
            // 楷体 - 中文楷书字体
            kaiti: 'STKaiti, KaiTi, "Kaiti SC", "AR PL UKai CN", serif',
            // 宋体 - 中文衬线字体
            songti: '"Songti SC", STSong, SimSun, "AR PL UMing CN", "Noto Serif CJK SC", serif',
            // 手写体 - 手写风格字体
            handwrite: '"Comic Sans MS", "Brush Script MT", "Segoe Script", cursive',
            // 等宽字体 - 代码/技术风格
            mono: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        };
    },

    addImageWatermark() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (f) => {
                fabric.Image.fromURL(f.target.result, (img) => {
                    img.scale(0.2);
                    canvas.add(img);
                    canvas.centerObject(img);
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    },

    // ========== 趣味贴纸功能 ==========
    _getStickerList() {
        return [
            { emoji: '😀', name: '笑脸' },
            { emoji: '😍', name: '爱心眼' },
            { emoji: '🎉', name: '庆祝' },
            { emoji: '⭐', name: '星星' },
            { emoji: '❤️', name: '红心' },
            { emoji: '👍', name: '点赞' },
            { emoji: '🔥', name: '火焰' },
            { emoji: '🌈', name: '彩虹' },
            { emoji: '🎀', name: '蝴蝶结' },
            { emoji: '🐱', name: '猫咪' },
            { emoji: '🌸', name: '樱花' },
            { emoji: '✨', name: '闪光' },
            { emoji: '🎵', name: '音符' },
            { emoji: '💎', name: '钻石' },
            { emoji: '🍀', name: '四叶草' },
            { emoji: '🦋', name: '蝴蝶' }
        ];
    },

    // 获取图标贴纸列表
    _getIconStickerList() {
        return [
            { id: 'book', name: '书籍', color: '#8B4513' },
            { id: 'eraser', name: '橡皮擦', color: '#FF6B6B' },
            { id: 'bookmark', name: '书签', color: '#4ECDC4' },
            { id: 'glasses', name: '眼镜', color: '#2C3E50' },
            { id: 'headphones', name: '耳机', color: '#9B59B6' },
            { id: 'coffee', name: '咖啡', color: '#D35400' },
            { id: 'envelope', name: '信封', color: '#3498DB' },
            { id: 'calculator', name: '计算器', color: '#1ABC9C' }
        ];
    },

    // 绘制图标贴纸到Canvas
    _drawIconSticker(ctx, id, size, color) {
        const centerX = size / 2;
        const centerY = size / 2;

        // 辅助函数：绘制圆角矩形
        const drawRoundRect = (ctx, x, y, w, h, r) => {
            if (w < 2 * r) r = w / 2;
            if (h < 2 * r) r = h / 2;
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        };

        switch (id) {
            case 'book':
                // 绘制书籍
                ctx.fillStyle = color;
                // 封面
                ctx.fillRect(centerX - 30, centerY - 40, 60, 80);
                // 书脊
                ctx.fillStyle = this._shadeColor(color, -20);
                ctx.fillRect(centerX - 40, centerY - 40, 10, 80);
                // 书页
                ctx.fillStyle = '#FFFEF7';
                ctx.fillRect(centerX - 30, centerY - 35, 55, 70);
                // 书签线
                ctx.strokeStyle = '#E74C3C';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(centerX + 10, centerY - 35);
                ctx.lineTo(centerX + 10, centerY + 35);
                ctx.stroke();
                break;

            case 'eraser':
                // 绘制橡皮擦
                ctx.fillStyle = '#FFE4E1';
                drawRoundRect(ctx, centerX - 35, centerY - 25, 70, 50, 8);
                ctx.fill();
                // 品牌文字
                ctx.fillStyle = '#FF6B6B';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('SUPER', centerX, centerY + 5);
                break;

            case 'bookmark':
                // 绘制书签 - 优化版
                // 书签主体
                const gradient = ctx.createLinearGradient(centerX - 25, centerY - 45, centerX + 25, centerY + 35);
                gradient.addColorStop(0, color);
                gradient.addColorStop(1, this._shadeColor(color, 20));
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(centerX - 28, centerY - 45);
                ctx.lineTo(centerX + 28, centerY - 45);
                ctx.lineTo(centerX + 28, centerY + 35);
                ctx.lineTo(centerX, centerY + 18);
                ctx.lineTo(centerX - 28, centerY + 35);
                ctx.closePath();
                ctx.fill();
                // 流苏
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY + 18);
                ctx.lineTo(centerX, centerY + 50);
                ctx.stroke();
                // 流苏末端
                ctx.fillStyle = this._shadeColor(color, -10);
                ctx.beginPath();
                ctx.arc(centerX, centerY + 52, 4, 0, Math.PI * 2);
                ctx.fill();
                // 装饰星星
                ctx.fillStyle = '#FFF';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('★', centerX, centerY - 15);
                break;

            case 'glasses':
                // 绘制眼镜
                // 镜框外圈
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.arc(centerX - 28, centerY, 24, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(centerX + 28, centerY, 24, 0, Math.PI * 2);
                ctx.stroke();
                // 镜片
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.beginPath();
                ctx.arc(centerX - 28, centerY, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(centerX + 28, centerY, 20, 0, Math.PI * 2);
                ctx.fill();
                // 镜框内圈
                ctx.strokeStyle = color;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(centerX - 28, centerY, 20, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(centerX + 28, centerY, 20, 0, Math.PI * 2);
                ctx.stroke();
                // 鼻梁
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(centerX - 8, centerY);
                ctx.lineTo(centerX + 8, centerY);
                ctx.stroke();
                // 镜腿
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(centerX - 52, centerY);
                ctx.lineTo(centerX - 60, centerY - 20);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(centerX + 52, centerY);
                ctx.lineTo(centerX + 60, centerY - 20);
                ctx.stroke();
                break;

            case 'headphones':
                // 绘制耳机
                // 头梁
                ctx.strokeStyle = color;
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.arc(centerX, centerY + 15, 38, Math.PI, 0);
                ctx.stroke();
                // 耳罩外圈
                ctx.fillStyle = this._shadeColor(color, 20);
                ctx.beginPath();
                ctx.ellipse(centerX - 38, centerY + 15, 18, 26, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(centerX + 38, centerY + 15, 18, 26, 0, 0, Math.PI * 2);
                ctx.fill();
                // 耳罩内圈
                ctx.fillStyle = '#2C3E50';
                ctx.beginPath();
                ctx.ellipse(centerX - 38, centerY + 18, 12, 18, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(centerX + 38, centerY + 18, 12, 18, 0, 0, Math.PI * 2);
                ctx.fill();
                // 耳罩装饰
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(centerX - 38, centerY + 18, 14, 20, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(centerX + 38, centerY + 18, 14, 20, 0, 0, Math.PI * 2);
                ctx.stroke();
                break;

            case 'coffee':
                // 绘制咖啡杯
                ctx.fillStyle = '#F5F5DC';
                drawRoundRect(ctx, centerX - 30, centerY - 25, 60, 50, 8);
                ctx.fill();
                // 杯口
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                ctx.ellipse(centerX, centerY - 25, 30, 8, 0, 0, Math.PI * 2);
                ctx.fill();
                // 咖啡液
                ctx.fillStyle = '#6F4E37';
                ctx.beginPath();
                ctx.ellipse(centerX, centerY - 25, 24, 6, 0, 0, Math.PI * 2);
                ctx.fill();
                // 把手
                ctx.strokeStyle = '#F5F5DC';
                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.arc(centerX + 40, centerY, 15, -Math.PI / 2, Math.PI / 2);
                ctx.stroke();
                // 蒸汽
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(centerX - 10, centerY - 40);
                ctx.quadraticCurveTo(centerX - 15, centerY - 55, centerX - 5, centerY - 60);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(centerX + 10, centerY - 40);
                ctx.quadraticCurveTo(centerX + 15, centerY - 55, centerX + 5, centerY - 60);
                ctx.stroke();
                break;

            case 'envelope':
                // 绘制信封 - 优化版
                // 信封主体
                ctx.fillStyle = color;
                drawRoundRect(ctx, centerX - 42, centerY - 30, 84, 60, 6);
                ctx.fill();
                // 信封盖
                ctx.fillStyle = this._shadeColor(color, -10);
                ctx.beginPath();
                ctx.moveTo(centerX - 42, centerY - 30);
                ctx.lineTo(centerX - 25, centerY - 5);
                ctx.lineTo(centerX, centerY - 25);
                ctx.lineTo(centerX + 25, centerY - 5);
                ctx.lineTo(centerX + 42, centerY - 30);
                ctx.closePath();
                ctx.fill();
                // 信封折痕
                ctx.strokeStyle = this._shadeColor(color, 15);
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(centerX - 42, centerY - 30);
                ctx.lineTo(centerX, centerY + 5);
                ctx.lineTo(centerX + 42, centerY - 30);
                ctx.stroke();
                // 封口处装饰
                ctx.fillStyle = this._shadeColor(color, 20);
                ctx.beginPath();
                ctx.arc(centerX, centerY - 25, 3, 0, Math.PI * 2);
                ctx.fill();
                // 邮票位置
                ctx.fillStyle = '#FFE4E1';
                ctx.fillRect(centerX + 25, centerY - 25, 12, 15);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.strokeRect(centerX + 25, centerY - 25, 12, 15);
                break;

            case 'calculator':
                // 绘制计算器
                ctx.fillStyle = color;
                drawRoundRect(ctx, centerX - 32, centerY - 40, 64, 80, 8);
                ctx.fill();
                // 屏幕
                ctx.fillStyle = '#2C3E50';
                drawRoundRect(ctx, centerX - 25, centerY - 32, 50, 22, 4);
                ctx.fill();
                // 屏幕数字
                ctx.fillStyle = '#27AE60';
                ctx.font = 'bold 16px monospace';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText('1234', centerX + 20, centerY - 18);
                // 按钮
                const btnColors = ['#E74C3C', '#3498DB', '#F39C12'];
                for (let row = 0; row < 3; row++) {
                    for (let col = 0; col < 3; col++) {
                        ctx.fillStyle = btnColors[row % 3];
                        drawRoundRect(ctx, centerX - 25 + col * 20, centerY - 5 + row * 20, 16, 16, 4);
                        ctx.fill();
                    }
                }
                break;
        }
    },

    initSticker() {
        this._stickerMode = true;  // 标记进入贴纸模式
        this.updatePropertyPanel('sticker');
    },

    // 辅助函数：调整颜色亮度
    _shadeColor(color, percent) {
        if (!color) return '#000000';
        // 简单的错误处理，如果不是 hex 颜色则直接返回原色
        if (!color.startsWith('#')) return color;

        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 +
            (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
            (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
            (B < 255 ? B < 1 ? 0 : B : 255)
        ).toString(16).slice(1);
    },

    addSticker(emoji, type = 'emoji') {
        // 创建离屏 Canvas 渲染贴纸
        const size = 128; // 贴纸基础尺寸
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = size;
        offscreenCanvas.height = size;
        const ctx = offscreenCanvas.getContext('2d');

        if (type === 'emoji') {
            // 绘制 Emoji
            ctx.font = `${size * 0.8}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(emoji, size / 2, size / 2);
        } else {
            // 绘制图标贴纸
            const icon = this._getIconStickerList().find(i => i.id === emoji);
            const color = icon ? icon.color : '#000000';
            this._drawIconSticker(ctx, emoji, size, color);
        }

        // 转为 Data URL
        const dataUrl = offscreenCanvas.toDataURL('image/png');

        // 添加到 Fabric.js 画布
        fabric.Image.fromURL(dataUrl, (img) => {
            // 设置初始位置（画布中心偏移，避免重叠）
            const offsetX = (Math.random() - 0.5) * 100;
            const offsetY = (Math.random() - 0.5) * 100;

            img.set({
                left: canvas.width / 2 + offsetX,
                top: canvas.height / 2 + offsetY,
                originX: 'center',
                originY: 'center',
                scaleX: 1,
                scaleY: 1,
                selectable: true,
                evented: true,
                // 标记为贴纸
                isSticker: true,
                stickerType: type,
                // 美化控制点
                cornerStyle: 'circle',
                cornerColor: '#3b82f6',
                cornerStrokeColor: '#ffffff',
                cornerSize: 10,
                transparentCorners: false,
                borderColor: '#3b82f6'
            });

            canvas.add(img);
            canvas.setActiveObject(img);
            canvas.renderAll();
            historyManager.push(canvas);
        });
    },


    rotateImage(angle) {
        // 获取所有对象
        const objects = canvas.getObjects();

        // 计算新的画布尺寸（90度或270度旋转时需要交换宽高）
        const needSwap = Math.abs(angle) === 90 || Math.abs(angle) === 270;
        const oldWidth = canvas.width;
        const oldHeight = canvas.height;
        const newWidth = needSwap ? oldHeight : oldWidth;
        const newHeight = needSwap ? oldWidth : oldHeight;

        // 旋转所有对象
        objects.forEach(obj => {
            // 计算对象相对于画布中心的位置
            const centerX = oldWidth / 2;
            const centerY = oldHeight / 2;
            const relX = obj.left - centerX;
            const relY = obj.top - centerY;

            // 根据旋转角度计算新位置
            let newRelX, newRelY;
            const rad = angle * Math.PI / 180;
            newRelX = relX * Math.cos(rad) - relY * Math.sin(rad);
            newRelY = relX * Math.sin(rad) + relY * Math.cos(rad);

            // 设置新位置和旋转角度
            obj.set({
                left: newWidth / 2 + newRelX,
                top: newHeight / 2 + newRelY,
                angle: (obj.angle || 0) + angle
            });

            obj.setCoords();
        });

        // 更新画布尺寸
        canvas.setDimensions({ width: newWidth, height: newHeight });
        canvas.renderAll();

        // 保存到历史记录
        historyManager.push(canvas);
    },

    // ========== 标注形状工具 ==========
    initShape() {
        this.updatePropertyPanel('shape');
    },

    addRect(strokeColor = '#1a73e8', strokeWidth = 2, lineStyle = 'dashed') {
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            strokeDashArray: lineStyle === 'dashed' ? [6, 3] : null,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            width: 120,
            height: 80,
            rx: 4, // Chrome DevTools style rounded corners
            ry: 4,
            // Shadow effect for depth
            shadow: new fabric.Shadow({
                color: 'rgba(0, 0, 0, 0.15)',
                blur: 4,
                offsetX: 1,
                offsetY: 1
            }),
            // Improved control point styling
            cornerStyle: 'circle',
            cornerColor: strokeColor,
            cornerStrokeColor: '#ffffff',
            cornerSize: 8,
            transparentCorners: false,
            borderColor: strokeColor,
            borderScaleFactor: 1.5
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
        historyManager.push(canvas);
    },

    addCircle(strokeColor = '#1a73e8', strokeWidth = 2, lineStyle = 'dashed') {
        const circle = new fabric.Circle({
            left: 100,
            top: 100,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            strokeDashArray: lineStyle === 'dashed' ? [6, 3] : null,
            strokeLineCap: 'round',
            radius: 50,
            // Shadow effect for depth
            shadow: new fabric.Shadow({
                color: 'rgba(0, 0, 0, 0.15)',
                blur: 4,
                offsetX: 1,
                offsetY: 1
            }),
            // Improved control point styling
            cornerStyle: 'circle',
            cornerColor: strokeColor,
            cornerStrokeColor: '#ffffff',
            cornerSize: 8,
            transparentCorners: false,
            borderColor: strokeColor,
            borderScaleFactor: 1.5
        });
        canvas.add(circle);
        canvas.setActiveObject(circle);
        historyManager.push(canvas);
    },

    addArrow(strokeColor = '#1a73e8', strokeWidth = 2, lineStyle = 'solid') {
        // Chrome DevTools style arrow - cleaner, more refined path
        const arrowPath = new fabric.Path('M 0 0 L 70 0 L 58 -8 M 70 0 L 58 8', {
            left: 100,
            top: 100,
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            strokeDashArray: lineStyle === 'dashed' ? [6, 3] : null,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            fill: 'transparent',
            scaleX: 1.5,
            scaleY: 1.5,
            // Shadow effect for depth
            shadow: new fabric.Shadow({
                color: 'rgba(0, 0, 0, 0.15)',
                blur: 4,
                offsetX: 1,
                offsetY: 1
            }),
            // Improved control point styling
            cornerStyle: 'circle',
            cornerColor: strokeColor,
            cornerStrokeColor: '#ffffff',
            cornerSize: 8,
            transparentCorners: false,
            borderColor: strokeColor,
            borderScaleFactor: 1.5
        });
        canvas.add(arrowPath);
        canvas.setActiveObject(arrowPath);
        historyManager.push(canvas);
    },

    addLine(strokeColor = '#1a73e8', strokeWidth = 2, lineStyle = 'solid') {
        const line = new fabric.Line([0, 0, 150, 0], {
            left: 100,
            top: 150,
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            strokeDashArray: lineStyle === 'dashed' ? [8, 4] : null,
            strokeLineCap: 'round',
            // Shadow effect for depth
            shadow: new fabric.Shadow({
                color: 'rgba(0, 0, 0, 0.15)',
                blur: 4,
                offsetX: 1,
                offsetY: 1
            }),
            // Improved control point styling
            cornerStyle: 'circle',
            cornerColor: strokeColor,
            cornerStrokeColor: '#ffffff',
            cornerSize: 8,
            transparentCorners: false,
            borderColor: strokeColor,
            borderScaleFactor: 1.5
        });
        canvas.add(line);
        canvas.setActiveObject(line);
        historyManager.push(canvas);
    },

    addDiamond(strokeColor = '#1a73e8', strokeWidth = 2, lineStyle = 'dashed') {
        const size = 80;
        const diamondPath = new fabric.Path(`
            M ${size / 2} 0
            L ${size} ${size / 2}
            L ${size / 2} ${size}
            L 0 ${size / 2}
            Z
        `, {
            left: 100,
            top: 100,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            strokeDashArray: lineStyle === 'dashed' ? [6, 3] : null,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            // Shadow effect for depth
            shadow: new fabric.Shadow({
                color: 'rgba(0, 0, 0, 0.15)',
                blur: 6,
                offsetX: 2,
                offsetY: 2
            }),
            // Improved control point styling
            cornerStyle: 'circle',
            cornerColor: strokeColor,
            cornerStrokeColor: '#ffffff',
            cornerSize: 8,
            transparentCorners: false,
            borderColor: strokeColor,
            borderScaleFactor: 1.5
        });
        canvas.add(diamondPath);
        canvas.setActiveObject(diamondPath);
        historyManager.push(canvas);
    },

    // ========== 图标生成器（独立画布系统）==========
    iconCanvas: null,
    iconGenState: null,

    initIconGenerator() {
        this.updatePropertyPanel('icon-gen');
        // 确保独立画布已初始化
        this.initIconCanvas();
    },

    // 初始化独立的图标画布
    initIconCanvas() {
        if (this.iconCanvas) return;

        const canvasEl = document.getElementById('icon-preview-canvas');
        if (!canvasEl) return;

        this.iconCanvas = new fabric.Canvas('icon-preview-canvas', {
            backgroundColor: '#2d2d2d',
            preserveObjectStacking: true,
            selection: true
        });

        this.iconCanvas.setDimensions({ width: 280, height: 280 });
        console.log('[图标生成器] 独立画布已初始化');
    },

    // 上传图片并裁剪成图标
    uploadAndCropIcon() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (f) => {
                const dataUrl = f.target.result;
                this.loadIconToPreview(dataUrl, 'upload');
            };
            reader.readAsDataURL(file);
        };
        input.click();
    },

    // 加载图标到预览画布
    loadIconToPreview(imageUrl, mode) {
        if (!this.iconCanvas) {
            this.initIconCanvas();
        }

        const keywordDisplay = document.getElementById('icon-keywords');
        this.iconCanvas.clear();

        fabric.Image.fromURL(imageUrl, (img) => {
            if (!img) {
                alert('图片加载失败');
                return;
            }

            console.log('[图标生成器] 图片加载成功:', img.width, 'x', img.height);

            const canvasSize = 280;
            const scale = Math.min(canvasSize / img.width, canvasSize / img.height);
            img.scale(scale);

            this.iconCanvas.setDimensions({ width: canvasSize, height: canvasSize });
            this.iconCanvas.add(img);
            this.iconCanvas.centerObject(img);
            this.iconCanvas.setActiveObject(img);
            this.iconCanvas.renderAll();

            // 保存原始图片信息，用于下载时正确缩放
            this.iconGenState = { mode, imageUrl, originalImage: img };
            if (keywordDisplay) {
                keywordDisplay.textContent = '✅ 图标已加载到预览区';
            }
        }, { crossOrigin: 'anonymous' });
    },

    // AI生成图标 - 集成 Gemini 2.5 API（使用独立画布）
    async generateIconWithAI(description) {
        if (!description || description.trim().length < 2) {
            alert('请输入图标描述');
            return;
        }

        const btn = document.getElementById('btn-generate-icon');
        const originalText = btn.textContent;
        const keywordDisplay = document.getElementById('icon-keywords');

        btn.disabled = true;
        btn.textContent = '☕ AI 生图中...';

        try {
            console.log('[AI图标] 开始生成，描述:', description);

            // 构建提示词 - 优化版：强调立体感和填充
            const prompt = `为浏览器插件生成一个 1:1 正方形尺寸的图标。

【核心要求】
- 构图：主体元素必须填满整个画布边缘，四角贴边，不能有任何空白边距
- 风格：现代扁平化设计，带轻微立体感和渐变效果
- 颜色：使用丰富的渐变色或双色搭配，避免单一纯色
- 细节：边缘清晰锐利，视觉冲击感强

【内容主题】
${description}

【技术规格】
- 尺寸：1024x1024 像素（高质量）
- 背景：渐变或纯色填充整个画布
- 格式：PNG 透明背景

请直接生成图标图片，不要包含任何文字说明或 Markdown 格式。`;

            // 从输入框获取 API 配置
            const apiKeyInput = document.getElementById('api-key');
            const apiUrlInput = document.getElementById('api-url');
            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            const apiUrl = apiUrlInput ? apiUrlInput.value.trim() : 'https://yunwu.ai/v1beta/models/gemini-2.5-flash-image-preview:generateContent';

            if (!apiKey) {
                alert('请先输入 API Key');
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }

            console.log('[AI图标] 发送 API 请求...');
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[AI图标] API 请求失败:', response.status, errorText);
                throw new Error(`API 请求失败 (${response.status})`);
            }

            const data = await response.json();
            console.log('[AI图标] API 响应:', data);

            // 解析图像数据
            let imageData = null;
            const parts = data?.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
                if (part.inlineData) {
                    imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    break;
                }
                if (part.text) {
                    const base64Match = part.text.match(/data:image\/[a-zA-Z]*;base64,[^"'\s\)]*/);
                    if (base64Match) {
                        imageData = base64Match[0];
                        break;
                    }
                    if (part.text.length > 1000 && !part.text.includes(' ')) {
                        imageData = `data:image/png;base64,${part.text.trim()}`;
                        break;
                    }
                }
            }

            if (!imageData) {
                console.error('[AI图标] 未找到图像数据，响应:', data);
                throw new Error('API 未返回有效的图像数据');
            }

            console.log('[AI图标] 图像数据已提取，长度:', imageData.length);
            btn.textContent = '🎨 渲染中...';

            // 加载到独立预览画布
            this.loadIconToPreview(imageData, 'ai');

            if (keywordDisplay) {
                keywordDisplay.textContent = '✨ 图标生成成功！可调整后下载';
            }

        } catch (error) {
            console.error('[AI图标] 生成失败:', error);
            alert(`生图失败: ${error.message}`);
            if (keywordDisplay) {
                keywordDisplay.textContent = `❌ 失败: ${error.message}`;
            }
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    // 打包下载图标包（使用独立画布）
    async downloadIcons() {
        if (!this.iconCanvas || this.iconCanvas.getObjects().length === 0) {
            alert('请先生成或上传图标');
            return;
        }

        const btn = document.getElementById('btn-download-icons');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '打包中...';

        try {
            const sizes = [16, 32, 48, 128];
            const zip = new JSZip();
            const imgFolder = zip.folder('extension-icons');

            // 获取当前画布中的图片对象
            const currentImg = this.iconCanvas.getObjects()[0];
            if (!currentImg) {
                alert('无法获取图片对象');
                return;
            }

            // 获取原始图片尺寸（使用未缩放的尺寸）
            const originalWidth = currentImg.width;
            const originalHeight = currentImg.height;

            // 辅助函数：克隆图片并生成指定尺寸的图标
            const generateIconOfSize = (size) => {
                return new Promise((resolve, reject) => {
                    // 创建一个临时画布用于生成该尺寸的图标
                    const tempCanvas = new fabric.Canvas(null, {
                        width: size,
                        height: size,
                        backgroundColor: null
                    });

                    // 克隆原始图片
                    currentImg.clone((clonedImg) => {
                        try {
                            // 重置缩放，使用原始尺寸
                            clonedImg.scale(1);

                            // 计算缩放比例：使用 cover 模式，确保图片完全填充画布
                            // Math.min 确保较大的边填满画布，较小的边可能超出
                            const scale = Math.min(size / originalWidth, size / originalHeight);
                            clonedImg.scale(scale);

                            // 居中并确保填满
                            tempCanvas.add(clonedImg);
                            tempCanvas.centerObject(clonedImg);

                            // 确保图片覆盖整个画布（左上角对齐，超出部分被裁剪）
                            const scaledWidth = originalWidth * scale;
                            const scaledHeight = originalHeight * scale;
                            clonedImg.set({
                                left: (size - scaledWidth) / 2,
                                top: (size - scaledHeight) / 2
                            });

                            tempCanvas.renderAll();

                            // 转换为 data URL
                            const dataUrl = tempCanvas.toDataURL({
                                format: 'png',
                                multiplier: 1
                            });
                            const base64Data = dataUrl.replace(/^data:image\/(png|jpg);base64,/, '');

                            // 清理临时画布
                            tempCanvas.dispose();

                            resolve({
                                size: size,
                                data: base64Data
                            });
                        } catch (err) {
                            tempCanvas.dispose();
                            reject(err);
                        }
                    });
                });
            };

            // 并发生成所有尺寸的图标
            const iconPromises = sizes.map(size => generateIconOfSize(size));
            const icons = await Promise.all(iconPromises);

            // 添加到 zip 文件
            for (const icon of icons) {
                imgFolder.file(`icon-${icon.size}x${icon.size}.png`, icon.data, { base64: true });
            }

            // 生成 manifest 片段
            const manifestContent = {
                icons: {
                    "16": "icon-16x16.png",
                    "32": "icon-32x32.png",
                    "48": "icon-48x48.png",
                    "128": "icon-128x128.png"
                }
            };
            imgFolder.file('manifest-icons.json', JSON.stringify(manifestContent, null, 2));

            const content = await zip.generateAsync({ type: 'blob' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'extension-icons.zip';
            link.click();

            alert('✅ 图标打包下载成功！');
        } catch (error) {
            console.error('[图标生成器] 打包失败:', error);
            alert('下载失败，请重试');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    applyFilters(brightness, contrast, saturation) {
        // 获取背景图片（第一个对象）
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) return;

        // 清除现有滤镜
        baseImage.filters = [];

        // 添加亮度滤镜 (范围: -1 到 1, 0为原始)
        if (brightness !== 0) {
            baseImage.filters.push(new fabric.Image.filters.Brightness({
                brightness: brightness
            }));
        }

        // 添加对比度滤镜 (范围: -1 到 1, 0为原始)
        if (contrast !== 0) {
            baseImage.filters.push(new fabric.Image.filters.Contrast({
                contrast: contrast
            }));
        }

        // 添加饱和度滤镜 (范围: -1 到 1, 0为原始)
        if (saturation !== 0) {
            baseImage.filters.push(new fabric.Image.filters.Saturation({
                saturation: saturation
            }));
        }

        // 应用滤镜
        baseImage.applyFilters();
        canvas.renderAll();
    },

    resetFilters() {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) return;

        baseImage.filters = [];
        baseImage.applyFilters();
        canvas.renderAll();

        // 重置滑块
        document.getElementById('brightness-slider').value = 0;
        document.getElementById('contrast-slider').value = 0;
        document.getElementById('saturation-slider').value = 0;
        document.getElementById('brightness-value').textContent = '0';
        document.getElementById('contrast-value').textContent = '0';
        document.getElementById('saturation-value').textContent = '0';
    },

    // ========== 图框/阴影功能 ==========
    initFrame() {
        this.updatePropertyPanel('frame');
    },

    applyFrame(frameShape, frameType, shadowType, frameWidth) {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先打开一张图片');
            return;
        }

        // 获取原始图片尺寸
        const imgWidth = baseImage.width * baseImage.scaleX;
        const imgHeight = baseImage.height * baseImage.scaleY;

        // 计算边框尺寸
        let paddingTop = frameWidth;
        let paddingRight = frameWidth;
        let paddingBottom = frameWidth;
        let paddingLeft = frameWidth;

        // 拍立得效果：底部边框更宽
        if (frameType === 'polaroid') {
            paddingBottom = frameWidth * 3;
        }

        // 计算新画布尺寸
        let newWidth, newHeight;
        
        if (frameShape === 'circle') {
            // 圆形边框：使用正方形画布，取图片较小边作为直径
            const diameter = Math.min(imgWidth, imgHeight);
            // 计算需要的边距，使图片居中
            const offsetX = (imgWidth - diameter) / 2;
            const offsetY = (imgHeight - diameter) / 2;
            
            newWidth = diameter + paddingLeft + paddingRight;
            newHeight = diameter + paddingTop + paddingBottom;
            
            // 保存偏移量，用于后续处理
            this._frameOffsetX = offsetX;
            this._frameOffsetY = offsetY;
            this._frameDiameter = diameter;
        } else {
            newWidth = imgWidth + paddingLeft + paddingRight;
            newHeight = imgHeight + paddingTop + paddingBottom;
            this._frameOffsetX = 0;
            this._frameOffsetY = 0;
            this._frameDiameter = 0;
        }

        // 创建离屏画布
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = newWidth;
        offscreenCanvas.height = newHeight;
        const ctx = offscreenCanvas.getContext('2d');

        // 绘制边框背景
        this._drawFrameBackground(ctx, frameShape, frameType, newWidth, newHeight, frameWidth);

        // 绘制阴影效果（内阴影在图片上方绘制）
        if (shadowType !== 'none' && shadowType !== 'inner') {
            this._applyShadow(ctx, shadowType, frameShape, paddingLeft, paddingTop, imgWidth, imgHeight);
        }

        // 将原始图片绘制到中心位置
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidth;
        tempCanvas.height = imgHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // 导出原始图片
        const imgDataUrl = baseImage.toDataURL({ format: 'png' });
        const img = new Image();

        img.onload = () => {
            tempCtx.drawImage(img, 0, 0, imgWidth, imgHeight);

            // 将图片绘制到主画布
            ctx.drawImage(tempCanvas, paddingLeft, paddingTop);

            // 如果是圆形边框，裁剪成圆形
            if (frameShape === 'circle') {
                ctx.save();
                ctx.globalCompositeOperation = 'destination-in';
                ctx.beginPath();
                const centerX = paddingLeft + this._frameDiameter / 2;
                const centerY = paddingTop + this._frameDiameter / 2;
                ctx.arc(centerX, centerY, this._frameDiameter / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }

            // 绘制内阴影效果
            if (shadowType === 'inner') {
                this._drawInnerShadow(ctx, frameShape, paddingLeft, paddingTop, imgWidth, imgHeight);
            }

            // 复古相框：绘制内边框线条
            if (frameType === 'vintage') {
                this._drawVintageFrame(ctx, frameShape, paddingLeft, paddingTop, imgWidth, imgHeight, frameWidth);
            }

            // 毛绒绒边框：添加毛绒效果
            if (frameType.startsWith('fluffy')) {
                this._drawFluffyEdge(ctx, frameShape, paddingLeft, paddingTop, imgWidth, imgHeight, frameWidth, frameType);
            }

            // 将结果加载到 Fabric.js 画布
            const resultDataUrl = offscreenCanvas.toDataURL('image/png');
            fabric.Image.fromURL(resultDataUrl, (newImg) => {
                canvas.clear();
                canvas.setDimensions({ width: newWidth, height: newHeight });
                newImg.set({
                    left: 0,
                    top: 0,
                    selectable: true,
                    evented: true
                });
                canvas.add(newImg);
                canvas.renderAll();
                historyManager.push(canvas);
            });
        };
        img.src = imgDataUrl;
    },

    _drawFrameBackground(ctx, frameShape, frameType, width, height, frameWidth) {
        // 判断是否是毛绒绒风格
        const isFluffy = frameType.startsWith('fluffy');
        
        // 毛绒绒风格的背景色
        let fluffyColor = '#ffffff';
        if (frameType === 'fluffy-white') fluffyColor = '#FFFEF7'; // 奶白
        else if (frameType === 'fluffy-camel') fluffyColor = '#D4C4B5'; // 浅驼
        else if (frameType === 'fluffy-pink') fluffyColor = '#FFB7C5'; // 樱花粉

        if (isFluffy) {
            // 毛绒绒风格使用圆角矩形背景
            this._drawRoundedRectWithFluffy(ctx, 0, 0, width, height, 20, fluffyColor);
        } else {
            switch (frameType) {
                case 'none':
                    ctx.fillStyle = 'transparent';
                    break;
                case 'white':
                    ctx.fillStyle = '#ffffff';
                    break;
                case 'black':
                    ctx.fillStyle = '#1a1a1a';
                    break;
                case 'gradient':
                    const gradient = ctx.createLinearGradient(0, 0, width, height);
                    gradient.addColorStop(0, '#667eea');
                    gradient.addColorStop(0.5, '#764ba2');
                    gradient.addColorStop(1, '#f093fb');
                    ctx.fillStyle = gradient;
                    break;
                case 'vintage':
                    ctx.fillStyle = '#3d2914';
                    break;
                case 'polaroid':
                    ctx.fillStyle = '#f5f5f5';
                    break;
                default:
                    ctx.fillStyle = '#ffffff';
            }
            
            if (frameShape === 'circle') {
                // 圆形边框：背景也是圆形
                ctx.beginPath();
                const centerX = width / 2;
                const centerY = height / 2;
                const radius = Math.min(width, height) / 2;
                ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.fillRect(0, 0, width, height);
            }
        }
    },

    _drawRoundedRectWithFluffy(ctx, x, y, width, height, radius, color) {
        // 先填充基础颜色
        ctx.fillStyle = color;
        this._drawRoundedRect(ctx, x, y, width, height, radius);
        ctx.fill();
        
        // 添加毛绒绒的边缘效果（随机噪点）
        ctx.save();
        const imageData = ctx.getImageData(x, y, width, height);
        const data = imageData.data;
        const noiseIntensity = 15;
        
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) { // 只处理非透明像素
                const noise = (Math.random() - 0.5) * noiseIntensity;
                data[i] = Math.min(255, Math.max(0, data[i] + noise));
                data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
                data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
            }
        }
        
        ctx.putImageData(imageData, x, y);
        ctx.restore();
    },

    _drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    _applyShadow(ctx, shadowType, frameShape, x, y, width, height) {
        ctx.save();
        switch (shadowType) {
            case 'soft':
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                break;
            case 'strong':
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 8;
                ctx.shadowOffsetY = 8;
                break;
            case 'long':
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 15;
                ctx.shadowOffsetY = 15;
                break;
        }
        
        // 绘制一个临时形状来产生阴影
        ctx.fillStyle = 'rgba(255,255,255,0.01)';
        
        if (frameShape === 'circle') {
            ctx.beginPath();
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const radius = Math.min(width, height) / 2;
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillRect(x, y, width, height);
        }
        
        ctx.restore();
    },

    _drawInnerShadow(ctx, frameShape, x, y, width, height) {
        // 内阴影效果：在图片边缘绘制渐变
        const shadowSize = 20;

        if (frameShape === 'circle') {
            // 圆形边框的内阴影
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const radius = Math.min(width, height) / 2;
            const innerRadius = radius - shadowSize;

            // 创建径向渐变实现内阴影
            const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, radius);
            gradient.addColorStop(0, 'rgba(0,0,0,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.3)');

            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        } else {
            // 矩形边框的内阴影
            // 上边内阴影
            const topGradient = ctx.createLinearGradient(x, y, x, y + shadowSize);
            topGradient.addColorStop(0, 'rgba(0,0,0,0.3)');
            topGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = topGradient;
            ctx.fillRect(x, y, width, shadowSize);

            // 左边内阴影
            const leftGradient = ctx.createLinearGradient(x, y, x + shadowSize, y);
            leftGradient.addColorStop(0, 'rgba(0,0,0,0.3)');
            leftGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = leftGradient;
            ctx.fillRect(x, y, shadowSize, height);

            // 下边内阴影
            const bottomGradient = ctx.createLinearGradient(x, y + height, x, y + height - shadowSize);
            bottomGradient.addColorStop(0, 'rgba(0,0,0,0.2)');
            bottomGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bottomGradient;
            ctx.fillRect(x, y + height - shadowSize, width, shadowSize);

            // 右边内阴影
            const rightGradient = ctx.createLinearGradient(x + width, y, x + width - shadowSize, y);
            rightGradient.addColorStop(0, 'rgba(0,0,0,0.2)');
            rightGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rightGradient;
            ctx.fillRect(x + width - shadowSize, y, shadowSize, height);
        }
    },

    _drawVintageFrame(ctx, frameShape, x, y, width, height, frameWidth) {
        // 复古相框：绘制内边框装饰线
        const innerPadding = frameWidth * 0.3;

        if (frameShape === 'circle') {
            // 圆形复古框
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const radius = Math.min(width, height) / 2;
            const innerRadius = radius - innerPadding;

            // 外层金色线
            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.stroke();

            // 内层深色线
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(centerX, centerY, innerRadius - 2, 0, Math.PI * 2);
            ctx.closePath();
            ctx.stroke();
        } else {
            // 矩形复古框
            // 外层金色线
            ctx.strokeStyle = '#b8860b';
            ctx.lineWidth = 2;
            ctx.strokeRect(innerPadding, innerPadding,
                x + width + frameWidth - innerPadding * 2,
                y + height + frameWidth - innerPadding * 2);

            // 内层深色线（贴近图片）
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
        }
    },

    _drawFluffyEdge(ctx, frameShape, x, y, width, height, frameWidth, frameType) {
        // 毛绒绒边缘效果
        const fluffyColor = frameType === 'fluffy-white' ? '#FFFEF7' :
                           frameType === 'fluffy-camel' ? '#D4C4B5' : '#FFB7C5';

        ctx.save();

        // 毛绒边缘宽度
        const fluffySize = 8;

        if (frameShape === 'circle') {
            // 圆形毛绒边缘
            const centerX = x + width / 2;
            const centerY = y + height / 2;
            const radius = Math.min(width, height) / 2;

            // 绘制多层毛绒边缘
            for (let i = fluffySize; i > 0; i -= 2) {
                const edgeRadius = radius + i;
                const alpha = 0.1 + (fluffySize - i) / fluffySize * 0.2;
                
                ctx.beginPath();
                // 添加随机波动模拟毛绒感
                for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
                    const r = edgeRadius + (Math.random() - 0.5) * 4;
                    const px = centerX + Math.cos(angle) * r;
                    const py = centerY + Math.sin(angle) * r;
                    if (angle === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                
                ctx.fillStyle = fluffyColor;
                ctx.globalAlpha = alpha;
                ctx.fill();
            }

            // 添加针织纹理效果
            ctx.globalAlpha = 0.15;
            for (let i = 0; i < 50; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = radius - 10 + Math.random() * 20;
                const px = centerX + Math.cos(angle) * dist;
                const py = centerY + Math.sin(angle) * dist;
                
                ctx.beginPath();
                ctx.arc(px, py, 1 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fillStyle = fluffyColor;
                ctx.fill();
            }
        } else {
            // 矩形毛绒边缘（圆角矩形）
            const radius = 20;
            
            // 绘制四边的毛绒效果
            const edges = [
                { x: x - fluffySize, y: y, w: width + fluffySize * 2, h: fluffySize }, // 上
                { x: x - fluffySize, y: y + height - fluffySize, w: width + fluffySize * 2, h: fluffySize }, // 下
                { x: x, y: y - fluffySize, w: fluffySize, h: height + fluffySize * 2 }, // 左
                { x: x + width - fluffySize, y: y - fluffySize, w: fluffySize, h: height + fluffySize * 2 } // 右
            ];

            edges.forEach(edge => {
                for (let i = fluffySize; i > 0; i -= 2) {
                    const alpha = 0.1 + (fluffySize - i) / fluffySize * 0.2;
                    ctx.fillStyle = fluffyColor;
                    ctx.globalAlpha = alpha;
                    ctx.fillRect(edge.x, edge.y + (Math.random() - 0.5) * 4, edge.w, i);
                }
            });

            // 添加针织纹理
            ctx.globalAlpha = 0.1;
            for (let i = 0; i < 100; i++) {
                const px = x - fluffySize + Math.random() * (width + fluffySize * 2);
                const py = y - fluffySize + Math.random() * (height + fluffySize * 2);
                
                ctx.beginPath();
                ctx.arc(px, py, 1 + Math.random() * 2, 0, Math.PI * 2);
                ctx.fillStyle = fluffyColor;
                ctx.fill();
            }
        }

        ctx.restore();
    },

    // ========== 去水印功能（智能裁剪法）==========
    initRemoveWatermark() {
        this.updatePropertyPanel('remove-watermark');
    },

    applySmartCrop(position, cropPercent) {
        // 获取当前图片
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先加载图片');
            return;
        }

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        const ratio = cropPercent / 100;

        // 计算裁剪区域
        let cropX = 0, cropY = 0, newWidth = imgWidth, newHeight = imgHeight;

        switch (position) {
            case 'top-left':
                cropX = imgWidth * ratio;
                cropY = imgHeight * ratio;
                newWidth = imgWidth - cropX;
                newHeight = imgHeight - cropY;
                break;
            case 'top-right':
                cropX = 0;
                cropY = imgHeight * ratio;
                newWidth = imgWidth * (1 - ratio);
                newHeight = imgHeight - cropY;
                break;
            case 'bottom-left':
                cropX = imgWidth * ratio;
                cropY = 0;
                newWidth = imgWidth - cropX;
                newHeight = imgHeight * (1 - ratio);
                break;
            case 'bottom-right':
                cropX = 0;
                cropY = 0;
                newWidth = imgWidth * (1 - ratio);
                newHeight = imgHeight * (1 - ratio);
                break;
        }

        // 创建离屏画布进行裁剪
        const offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = newWidth;
        offscreenCanvas.height = newHeight;
        const ctx = offscreenCanvas.getContext('2d');

        // 导出当前画布内容
        const dataUrl = canvas.toDataURL({ format: 'png' });
        const img = new Image();

        img.onload = () => {
            // 根据位置进行裁剪
            ctx.drawImage(img, cropX, cropY, newWidth, newHeight, 0, 0, newWidth, newHeight);

            // 将裁剪结果加载回画布
            const resultDataUrl = offscreenCanvas.toDataURL('image/png');
            fabric.Image.fromURL(resultDataUrl, (newImg) => {
                canvas.clear();
                canvas.setDimensions({ width: newWidth, height: newHeight });
                newImg.set({
                    left: 0,
                    top: 0,
                    selectable: true,
                    evented: true
                });
                canvas.add(newImg);
                canvas.renderAll();
                historyManager.push(canvas);
                alert('✅ 水印已移除！');
            });
        };
        img.src = dataUrl;
    },

    updatePropertyPanel(tool) {
        // 切换工具时退出贴纸模式
        if (tool !== 'sticker') {
            this._stickerMode = false;
        }

        const panel = document.getElementById('panel-content');
        panel.innerHTML = '';

        if (tool === 'crop') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>裁剪比例</label>
                    <select id="crop-ratio" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="free">自由比例</option>
                        <option value="1:1">1:1 (正方形)</option>
                        <option value="3:4">3:4</option>
                        <option value="4:3">4:3</option>
                        <option value="9:16">9:16</option>
                        <option value="16:9">16:9</option>
                    </select>
                </div>
                <button id="apply-crop" class="primary-btn" style="width:100%; margin-top:10px;">应用裁剪</button>
`;

            document.getElementById('crop-ratio').addEventListener('change', (e) => {
                this.setCropRatio(e.target.value);
            });

            document.getElementById('apply-crop').addEventListener('click', () => {
                this.applyCrop();
            });
        } else if (tool === 'ocr') {
            const hasConfig = localStorage.getItem('ocrApiKey') && localStorage.getItem('ocrSecretKey');
            const statusClass = hasConfig ? 'success' : '';
            const statusText = hasConfig ? '✓ API 已配置' : '⚠ 请先配置 API';

            panel.innerHTML = `
                <div class="ocr-panel-info ${statusClass}">
                    ${statusText}
                </div>
                <div class="prop-item">
                    <button id="ocr-recognize-btn" class="primary-btn" style="width:100%;" ${!hasConfig ? 'disabled' : ''}>🔍 开始识别</button>
                </div>
                <div class="prop-item" style="margin-top:10px;">
                    <button id="ocr-settings-btn" class="secondary-btn" style="width:100%;">⚙️ API 设置</button>
                </div>
                <div class="prop-item" style="margin-top:15px;">
                    <p style="font-size:11px; color:#888; text-align:center;">识别当前画布中的所有文字</p>
                </div>
`;

            document.getElementById('ocr-recognize-btn').addEventListener('click', () => {
                this.callOCRAPI();
            });

            document.getElementById('ocr-settings-btn').addEventListener('click', () => {
                this.showOCRConfigModal();
            });
        } else if (tool === 'ai-gen') {
            const hasConfig = localStorage.getItem('aigenApiToken');
            const statusClass = hasConfig ? 'success' : '';
            const statusText = hasConfig ? '✓ API 已配置' : '⚠ 请先配置 API Token';

            panel.innerHTML = `
                <div class="aigen-panel-info ${statusClass}">
                    ${statusText}
                </div>
                <div class="prop-item">
                    <label>提示词 (Prompt)</label>
                    <textarea id="aigen-prompt" class="aigen-prompt-input" placeholder="描述你想生成的图片，例如：一只金色的猫咪在阳光下玩耍"></textarea>
                </div>
                <div class="prop-item">
                    <label>图片尺寸</label>
                    <select id="aigen-size" style="width:100%; padding:8px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:6px; font-size:14px;">
                        <option value="1024x1024" selected>1:1 (1024×1024)</option>
                        <option value="768x1024">3:4 (768×1024)</option>
                        <option value="576x1024">9:16 (576×1024)</option>
                        <option value="1024x768">4:3 (1024×768)</option>
                        <option value="1024x576">16:9 (1024×576)</option>
                    </select>
                </div>
                <div class="prop-item">
                    <button id="aigen-generate-btn" class="primary-btn" style="width:100%;" ${!hasConfig ? 'disabled' : ''}>🎨 开始生成</button>
                </div>
                <div class="prop-item" style="margin-top:10px;">
                    <button id="aigen-settings-btn" class="secondary-btn" style="width:100%;">⚙️ API 设置</button>
                </div>
                <div class="prop-item" style="margin-top:15px;">
                    <p style="font-size:11px; color:#888; text-align:center;">使用 ModelScope Qwen-Image 生成图片</p>
                </div>
`;

            document.getElementById('aigen-generate-btn').addEventListener('click', () => {
                const prompt = document.getElementById('aigen-prompt').value.trim();
                if (!prompt) {
                    alert('请输入提示词');
                    return;
                }
                const size = document.getElementById('aigen-size').value;
                this.callAIGenAPI(prompt, size);
            });

            document.getElementById('aigen-settings-btn').addEventListener('click', () => {
                this.showAIGenConfigModal();
            });
        } else if (tool === 'mosaic') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>马赛克效果</label>
                    <select id="mosaic-type" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="pixel">纯色块 (像素化)</option>
                        <option value="blur">高斯模糊</option>
                        <option value="frosted">毛玻璃</option>
                    </select>
                </div>
                <div class="prop-item">
                    <label>笔刷大小</label>
                    <input type="range" min="10" max="100" value="20" id="brush-size">
                    <span id="brush-size-value" style="color:#888; font-size:12px;">20px</span>
                </div>
                <div class="prop-item" id="pixel-size-container">
                    <label>像素块大小</label>
                    <input type="range" min="5" max="30" value="10" id="block-size">
                    <span id="block-size-value" style="color:#888; font-size:12px;">10px</span>
                </div>
                <div class="prop-item" id="blur-radius-container" style="display:none;">
                    <label>模糊半径</label>
                    <input type="range" min="1" max="20" value="5" id="blur-radius">
                    <span id="blur-radius-value" style="color:#888; font-size:12px;">5px</span>
                </div>
                <div class="prop-item" id="frosted-opacity-container" style="display:none;">
                    <label>不透明度</label>
                    <input type="range" min="0.1" max="1" step="0.1" value="0.7" id="frosted-opacity">
                    <span id="frosted-opacity-value" style="color:#888; font-size:12px;">0.7</span>
                </div>
`;
            // 笔刷大小
            document.getElementById('brush-size').addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                document.getElementById('brush-size-value').textContent = value + 'px';
                if (this.mosaicBrush) {
                    this.mosaicBrush.width = value;
                }
            });
            // 像素块大小
            document.getElementById('block-size').addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                document.getElementById('block-size-value').textContent = value + 'px';
                if (this.mosaicBrush) {
                    this.mosaicBrush.blockSize = value;
                }
            });
            // 模糊半径
            document.getElementById('blur-radius').addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                document.getElementById('blur-radius-value').textContent = value + 'px';
                if (this.mosaicBrush) {
                    this.mosaicBrush.blurRadius = value;
                }
            });
            // 毛玻璃不透明度
            document.getElementById('frosted-opacity').addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                document.getElementById('frosted-opacity-value').textContent = value;
                if (this.mosaicBrush) {
                    this.mosaicBrush.frostedOpacity = value;
                }
            });
            // 效果类型切换
            document.getElementById('mosaic-type').addEventListener('change', (e) => {
                const type = e.target.value;
                if (this.mosaicBrush) {
                    this.mosaicBrush.type = type;
                }
                // 显示/隐藏对应的参数控制
                document.getElementById('pixel-size-container').style.display = type === 'pixel' ? 'block' : 'none';
                document.getElementById('blur-radius-container').style.display = type === 'blur' ? 'block' : 'none';
                document.getElementById('frosted-opacity-container').style.display = type === 'frosted' ? 'block' : 'none';
            });
        } else if (tool === 'shape') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>形状类型</label>
                    <select id="shape-type" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="rect">⬜ 矩形</option>
                        <option value="circle">⭕ 圆形</option>
                        <option value="line">➖ 直线</option>
                        <option value="diamond">🔶 菱形</option>
                        <option value="arrow">➡️ 箭头</option>
                    </select>
                </div>
                <div class="prop-item">
                    <label>预设颜色</label>
                    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:6px; margin-bottom:8px;">
                        <div class="shape-color-opt" style="background:#1a73e8; height:26px; border-radius:4px; cursor:pointer; border:2px solid #1a73e8;" data-color="#1a73e8" title="DevTools 蓝"></div>
                        <div class="shape-color-opt" style="background:#ea4335; height:26px; border-radius:4px; cursor:pointer; border:2px solid transparent;" data-color="#ea4335" title="警告红"></div>
                        <div class="shape-color-opt" style="background:#34a853; height:26px; border-radius:4px; cursor:pointer; border:2px solid transparent;" data-color="#34a853" title="成功绿"></div>
                        <div class="shape-color-opt" style="background:#fbbc05; height:26px; border-radius:4px; cursor:pointer; border:2px solid transparent;" data-color="#fbbc05" title="警告黄"></div>
                        <div class="shape-color-opt" style="background:#9c27b0; height:26px; border-radius:4px; cursor:pointer; border:2px solid transparent;" data-color="#9c27b0" title="紫色"></div>
                    </div>
                    <input type="color" id="shape-color-preset" value="#1a73e8" style="width:100%; height:30px; border:1px solid #333; border-radius:4px; background:#2d2d2d; cursor:pointer;">
                </div>
                <div class="prop-item">
                    <label>线条样式</label>
                    <select id="shape-line-style" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="dashed">虚线 (DevTools 风格)</option>
                        <option value="solid">实线</option>
                    </select>
                </div>
                <div class="prop-item">
                    <label>线条粗细</label>
                    <input type="range" min="1" max="10" value="2" id="shape-width-preset">
                    <span id="shape-width-preset-value" style="color:#1a73e8;">2px</span>
                </div>
                <button id="add-shape" class="primary-btn" style="width:100%; margin-top:10px;">添加形状</button>
`;

            // Preset color selection
            let selectedColor = '#1a73e8';
            const colorOpts = panel.querySelectorAll('.shape-color-opt');
            colorOpts.forEach(opt => {
                opt.addEventListener('click', () => {
                    colorOpts.forEach(o => o.style.border = '2px solid transparent');
                    opt.style.border = `2px solid ${opt.dataset.color}`;
                    selectedColor = opt.dataset.color;
                    document.getElementById('shape-color-preset').value = selectedColor;
                });
            });

            // Custom color picker sync
            document.getElementById('shape-color-preset').addEventListener('input', (e) => {
                selectedColor = e.target.value;
                colorOpts.forEach(o => o.style.border = '2px solid transparent');
            });

            document.getElementById('shape-width-preset').addEventListener('input', (e) => {
                document.getElementById('shape-width-preset-value').textContent = e.target.value + 'px';
            });

            document.getElementById('add-shape').addEventListener('click', () => {
                const shapeType = document.getElementById('shape-type').value;
                const strokeColor = document.getElementById('shape-color-preset').value;
                const strokeWidth = parseInt(document.getElementById('shape-width-preset').value);
                const lineStyle = document.getElementById('shape-line-style').value;

                switch (shapeType) {
                    case 'rect':
                        this.addRect(strokeColor, strokeWidth, lineStyle);
                        break;
                    case 'circle':
                        this.addCircle(strokeColor, strokeWidth, lineStyle);
                        break;
                    case 'line':
                        this.addLine(strokeColor, strokeWidth, lineStyle);
                        break;
                    case 'diamond':
                        this.addDiamond(strokeColor, strokeWidth, lineStyle);
                        break;
                    case 'arrow':
                        this.addArrow(strokeColor, strokeWidth, lineStyle);
                        break;
                }
            });
        } else if (tool === 'remove-watermark') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>水印位置</label>
                    <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; margin-top:8px;">
                        <button class="wm-pos-btn" data-pos="top-left" style="padding:12px; background:#2d2d2d; border:2px solid #1a73e8; border-radius:6px; color:white; cursor:pointer; font-size:13px;">↖ 左上</button>
                        <button class="wm-pos-btn" data-pos="top-right" style="padding:12px; background:#2d2d2d; border:2px solid transparent; border-radius:6px; color:white; cursor:pointer; font-size:13px;">↗ 右上</button>
                        <button class="wm-pos-btn" data-pos="bottom-left" style="padding:12px; background:#2d2d2d; border:2px solid transparent; border-radius:6px; color:white; cursor:pointer; font-size:13px;">↙ 左下</button>
                        <button class="wm-pos-btn" data-pos="bottom-right" style="padding:12px; background:#2d2d2d; border:2px solid transparent; border-radius:6px; color:white; cursor:pointer; font-size:13px;">↘ 右下</button>
                    </div>
                </div>
                <div class="prop-item">
                    <label>裁剪比例</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <input type="range" min="2" max="30" value="10" id="crop-percent-slider" style="flex:1;">
                        <input type="number" min="2" max="30" value="10" id="crop-percent-input" style="width:55px; padding:4px 6px; background:#2d2d2d; color:#1a73e8; border:1px solid #333; border-radius:4px; text-align:center;">
                        <span style="color:#888;">%</span>
                    </div>
                </div>
                <p style="font-size: 11px; color: #888; margin-top: 8px;">根据选定的角落位置，裁剪掉一定比例的区域来移除水印。</p>
                <button id="apply-smart-crop" class="primary-btn" style="width:100%; margin-top:10px;">应用裁剪去水印</button>
`;

            // 位置选择
            let selectedPosition = 'top-left';
            const posButtons = panel.querySelectorAll('.wm-pos-btn');
            posButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    posButtons.forEach(b => b.style.border = '2px solid transparent');
                    btn.style.border = '2px solid #1a73e8';
                    selectedPosition = btn.dataset.pos;
                });
            });

            // 裁剪比例 - 滑块和输入框同步
            const slider = document.getElementById('crop-percent-slider');
            const numInput = document.getElementById('crop-percent-input');

            slider.addEventListener('input', (e) => {
                numInput.value = e.target.value;
            });

            numInput.addEventListener('input', (e) => {
                let val = parseInt(e.target.value) || 2;
                val = Math.max(2, Math.min(30, val));
                slider.value = val;
            });

            // 应用裁剪
            document.getElementById('apply-smart-crop').addEventListener('click', () => {
                const cropPercent = parseInt(document.getElementById('crop-percent-slider').value);
                this.applySmartCrop(selectedPosition, cropPercent);
            });
        } else if (tool === 'magic-eraser') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label style="color:#ff6b6b; font-weight:bold;">🪄 消除笔</label>
                    <p style="font-size:11px; color:#888; margin:8px 0;">用画笔涂抹要消除的人物或物品</p>
                </div>
                <div class="prop-item">
                    <label>画笔大小</label>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <input type="range" min="5" max="80" value="30" id="eraser-brush-size" style="flex:1;">
                        <span id="eraser-brush-size-value" style="color:#ff6b6b; min-width:40px;">30px</span>
                    </div>
                </div>
                <div id="eraser-progress-container" style="display:none; margin-top:10px;">
                    <div style="background:#333; border-radius:4px; height:8px; overflow:hidden;">
                        <div id="eraser-progress-bar" style="background:linear-gradient(90deg, #ff6b6b, #ee5a5a); height:100%; width:0%; transition:width 0.3s;"></div>
                    </div>
                    <p id="eraser-progress-text" style="font-size:11px; color:#888; margin-top:5px; text-align:center;">准备中...</p>
                </div>
                <button id="apply-magic-eraser" class="primary-btn" style="width:100%; margin-top:12px; background:linear-gradient(135deg, #ff6b6b, #ee5a5a);">✨ 应用消除</button>
                <button id="clear-eraser-mask" class="secondary-btn" style="width:100%; margin-top:8px;">🗑️ 清除涂抹</button>
                <p style="font-size:10px; color:#666; margin-top:12px; line-height:1.5;">
                    提示：首次使用需下载 AI 模型（约200MB），模型会缓存到本地，下次使用无需重新下载。
                </p>
`;

            // 画笔大小调节
            const brushSizeInput = document.getElementById('eraser-brush-size');
            const brushSizeValue = document.getElementById('eraser-brush-size-value');

            brushSizeInput.addEventListener('input', (e) => {
                const size = parseInt(e.target.value);
                brushSizeValue.textContent = size + 'px';
                this.eraserBrushSize = size;

                // 更新画笔预览大小
                if (this.eraserBrushPreview) {
                    this.eraserBrushPreview.style.width = size + 'px';
                    this.eraserBrushPreview.style.height = size + 'px';
                }
            });

            // 应用消除
            document.getElementById('apply-magic-eraser').addEventListener('click', () => {
                this.applyMagicEraser();
            });

            // 清除涂抹
            document.getElementById('clear-eraser-mask').addEventListener('click', () => {
                this.clearEraserMask();
            });
        } else if (tool === 'sticker') {
            const stickers = this._getStickerList();
            const iconStickers = this._getIconStickerList();

            // Emoji 贴纸按钮
            const stickerButtons = stickers.map(s =>
                `<div class="sticker-item" data-emoji="${s.emoji}" data-type="emoji" title="${s.name}"
                    style="font-size:24px; cursor:pointer; padding:6px; background:#2d2d2d;
                    border:2px solid transparent; border-radius:8px; text-align:center;
                    transition: all 0.15s ease; display:flex; align-items:center; justify-content:center;
                    min-height:44px;">
                    ${s.emoji}
                </div>`
            ).join('');

            // 图标贴纸按钮（使用 Canvas 绘制预览）
            const iconStickerButtons = iconStickers.map(s => {
                const previewCanvas = document.createElement('canvas');
                previewCanvas.width = 40;
                previewCanvas.height = 40;
                const previewCtx = previewCanvas.getContext('2d');
                previewCtx.scale(0.3, 0.3);
                previewCtx.translate(20, 20);
                this._drawIconSticker(previewCtx, s.id, 80, s.color);
                const dataUrl = previewCanvas.toDataURL();
                return `<div class="sticker-item" data-emoji="${s.id}" data-type="icon" title="${s.name}"
                    style="cursor:pointer; padding:6px; background:#2d2d2d;
                    border:2px solid transparent; border-radius:8px; text-align:center;
                    transition: all 0.15s ease; display:flex; align-items:center; justify-content:center;
                    min-height:44px; background-image: url(${dataUrl}); background-size: contain; background-position: center; background-repeat: no-repeat;">
                </div>`;
            }).join('');

            panel.innerHTML = `
                <div class="prop-item">
                    <label style="color:#f59e0b; font-weight:bold;">😊 Emoji 表情</label>
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-top:8px;">
                        ${stickerButtons}
                    </div>
                </div>
                <div class="prop-item" style="margin-top:16px; padding-top:12px; border-top:1px solid #333;">
                    <label style="color:#10b981; font-weight:bold;">🎨 精美图标</label>
                    <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:6px; margin-top:8px;">
                        ${iconStickerButtons}
                    </div>
                </div>
                <p style="font-size:10px; color:#666; margin-top:12px; padding-top:8px; border-top:1px solid #333;">
                    💡 点击贴纸添加到画布，可拖动、缩放、旋转
                </p>
`;

            // 贴纸点击事件
            const stickerItems = panel.querySelectorAll('.sticker-item');
            stickerItems.forEach(item => {
                item.addEventListener('mouseenter', () => {
                    item.style.border = '2px solid #f59e0b';
                    item.style.transform = 'scale(1.1)';
                    item.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.3)';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.border = '2px solid transparent';
                    item.style.transform = 'scale(1)';
                    item.style.boxShadow = 'none';
                });
                item.addEventListener('click', () => {
                    const emoji = item.dataset.emoji;
                    const type = item.dataset.type;
                    this.addSticker(emoji, type);
                });
            });
        } else if (tool === 'grid-slice') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>行数 (Rows)</label>
                    <input type="number" id="grid-rows" value="3" min="1" max="20" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                </div>
                <div class="prop-item">
                    <label>列数 (Cols)</label>
                    <input type="number" id="grid-cols" value="3" min="1" max="20" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                </div>
                <p style="font-size: 12px; color: #888; margin-top: 10px;">将图片平均切割并打包成 ZIP 下载。</p>
                <button id="apply-grid-slice" class="primary-btn" style="width:100%; margin-top:10px;">开始切图并下载</button>
`;

            document.getElementById('apply-grid-slice').addEventListener('click', () => {
                const rows = parseInt(document.getElementById('grid-rows').value);
                const cols = parseInt(document.getElementById('grid-cols').value);
                this.applyGridSlice(rows, cols);
            });
        } else if (tool === 'id-photo') {
            const templates = this._getIDPhotoTemplates();
            const sizeOptions = Object.entries(templates)
                .map(([key, t]) => `<option value="${key}">${t.label}</option>`)
                .join('');

            panel.innerHTML = `
                <div class="prop-item">
                    <label>底色</label>
                    <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin-bottom:10px;">
                        <div class="color-opt" style="background:#ffffff; border:1px solid #444; height:24px; border-radius:4px; cursor:pointer;" data-color="#ffffff"></div>
                        <div class="color-opt" style="background:#3b82f6; border:1px solid #444; height:24px; border-radius:4px; cursor:pointer;" data-color="#3b82f6"></div>
                        <div class="color-opt" style="background:#ef4444; border:1px solid #444; height:24px; border-radius:4px; cursor:pointer;" data-color="#ef4444"></div>
                    </div>
                </div>
                <div class="prop-item">
                    <label>尺寸</label>
                    <select id="id-photo-size" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        ${sizeOptions}
                    </select>
                </div>
                <button id="btn-generate-id-photo" class="primary-btn" style="width:100%; margin-top:10px;">一键生成证件照</button>
                <p style="font-size:11px; color:#888; margin-top:10px;">生成后：点击人像，可拖拽/缩放调整。</p>
`;

            let selectedColor = '#ffffff';
            const colorOpts = panel.querySelectorAll('.color-opt');
            colorOpts.forEach(opt => {
                opt.addEventListener('click', () => {
                    colorOpts.forEach(o => o.style.outline = 'none');
                    opt.style.outline = '2px solid #3b82f6';
                    selectedColor = opt.dataset.color;
                    this.idPhotoState = null;
                });
            });
            if (colorOpts[0]) colorOpts[0].style.outline = '2px solid #3b82f6';

            const sizeSelect = document.getElementById('id-photo-size');
            sizeSelect.addEventListener('change', () => {
                this.idPhotoState = null;
            });

            document.getElementById('btn-generate-id-photo').addEventListener('click', () => {
                const sizeKey = document.getElementById('id-photo-size').value;
                this.generateIDPhoto(sizeKey, selectedColor, 100);
            });
        } else if (tool === 'ai-background') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>选择背景颜色</label>
                    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; margin-bottom:10px;">
                        <div class="color-opt" style="background:#ffffff; border:1px solid #444;" data-color="#ffffff"></div>
                        <div class="color-opt" style="background:#3b82f6;" data-color="#3b82f6"></div>
                        <div class="color-opt" style="background:#ef4444;" data-color="#ef4444"></div>
                        <div class="color-opt" style="background:#10b981;" data-color="#10b981"></div>
                        <input type="color" id="ai-custom-color" style="width:100%; height:24px; padding:0; border:none; background:none; cursor:pointer;">
                    </div>
                </div>
                <div class="prop-item">
                    <label>或上传背景图片</label>
                    <input type="file" id="ai-bg-upload" accept="image/*" style="width:100%; font-size:12px;">
                </div>
                <button id="btn-apply-ai" class="primary-btn" style="width:100%; margin-top:10px;">立即替换</button>
                <p style="font-size:11px; color:#888; margin-top:10px;">替换后：点击人像，可拖拽/缩放调整。</p>
                <p style="font-size:11px; color:#888; margin-top:10px;">注：首次加载 AI 模型需约 10-20 秒，请保持网络通畅。</p>
`;

            let selectedColor = '#ffffff';
            const colorOpts = panel.querySelectorAll('.color-opt');
            colorOpts.forEach(opt => {
                opt.style.height = '24px';
                opt.style.cursor = 'pointer';
                opt.style.borderRadius = '4px';
                opt.addEventListener('click', () => {
                    colorOpts.forEach(o => o.style.outline = 'none');
                    opt.style.outline = '2px solid #3b82f6';
                    selectedColor = opt.dataset.color;
                    document.getElementById('ai-custom-color').value = selectedColor;
                });
            });

            document.getElementById('btn-apply-ai').addEventListener('click', () => {
                const customColor = document.getElementById('ai-custom-color').value;
                const fileInput = document.getElementById('ai-bg-upload');

                if (fileInput.files && fileInput.files[0]) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => this.applyAiBackground('image', img, 100);
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(fileInput.files[0]);
                } else {
                    this.applyAiBackground('color', customColor || selectedColor, 100);
                }
            });
        } else if (tool === 'resize') {
            const img = canvas.getObjects()[0];
            if (!img) return;

            panel.innerHTML = `
                <div class="prop-item">
                    <label>宽度 (px)</label>
                    <input type="number" id="resize-w" value="${Math.round(canvas.width)}">
                </div>
                <div class="prop-item">
                    <label>高度 (px)</label>
                    <input type="number" id="resize-h" value="${Math.round(canvas.height)}">
                </div>
                <button id="apply-resize" class="primary-btn" style="width:100%; margin-top:10px;">应用修改</button>
`;

            document.getElementById('apply-resize').addEventListener('click', () => {
                const w = parseInt(document.getElementById('resize-w').value);
                const h = parseInt(document.getElementById('resize-h').value);

                const scaleX = w / canvas.width;
                const scaleY = h / canvas.height;

                canvas.setDimensions({ width: w, height: h });
                canvas.forEachObject(obj => {
                    obj.scaleX *= scaleX;
                    obj.scaleY *= scaleY;
                    obj.left *= scaleX;
                    obj.top *= scaleY;
                    obj.setCoords();
                });
                canvas.renderAll();
                historyManager.push(canvas);
            });
        } else if (tool === 'rotate') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>顺时针旋转</label>
                    <button id="rotate-90" class="secondary-btn" style="width:100%; margin-bottom:8px;">↻ 90°</button>
                    <button id="rotate-180" class="secondary-btn" style="width:100%;">↻ 180°</button>
                </div>
                <div class="prop-item">
                    <label>逆时针旋转</label>
                    <button id="rotate-minus-90" class="secondary-btn" style="width:100%; margin-bottom:8px;">↺ 90°</button>
                    <button id="rotate-minus-180" class="secondary-btn" style="width:100%;">↺ 180°</button>
                </div>
`;

            document.getElementById('rotate-90').addEventListener('click', () => {
                this.rotateImage(90);
            });

            document.getElementById('rotate-180').addEventListener('click', () => {
                this.rotateImage(180);
            });

            document.getElementById('rotate-minus-90').addEventListener('click', () => {
                this.rotateImage(-90);
            });

            document.getElementById('rotate-minus-180').addEventListener('click', () => {
                this.rotateImage(-180);
            });
        } else if (tool === 'filter') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>亮度</label>
                    <input type="range" min="-100" max="100" value="0" id="brightness-slider">
                    <span id="brightness-value" style="color:#3b82f6;">0</span>
                </div>
                <div class="prop-item">
                    <label>对比度</label>
                    <input type="range" min="-100" max="100" value="0" id="contrast-slider">
                    <span id="contrast-value" style="color:#3b82f6;">0</span>
                </div>
                <div class="prop-item">
                    <label>饱和度</label>
                    <input type="range" min="-100" max="100" value="0" id="saturation-slider">
                    <span id="saturation-value" style="color:#3b82f6;">0</span>
                </div>
                <button id="reset-filters" class="secondary-btn" style="width:100%; margin-top:10px;">重置滤镜</button>
`;

            const updateFilters = () => {
                const brightness = parseInt(document.getElementById('brightness-slider').value) / 100;
                const contrast = parseInt(document.getElementById('contrast-slider').value) / 100;
                const saturation = parseInt(document.getElementById('saturation-slider').value) / 100;

                document.getElementById('brightness-value').textContent = Math.round(brightness * 100);
                document.getElementById('contrast-value').textContent = Math.round(contrast * 100);
                document.getElementById('saturation-value').textContent = Math.round(saturation * 100);

                this.applyFilters(brightness, contrast, saturation);
            };

            document.getElementById('brightness-slider').addEventListener('input', updateFilters);
            document.getElementById('contrast-slider').addEventListener('input', updateFilters);
            document.getElementById('saturation-slider').addEventListener('input', updateFilters);

            document.getElementById('reset-filters').addEventListener('click', () => {
                this.resetFilters();
            });
        } else if (tool === 'frame') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>边框形状</label>
                    <select id="frame-shape" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="rect">矩形</option>
                        <option value="circle">圆形</option>
                    </select>
                </div>
                <div class="prop-item">
                    <label>图框类型</label>
                    <select id="frame-type" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="none">无边框</option>
                        <option value="white">简约白边</option>
                        <option value="black">简约黑边</option>
                        <option value="gradient">渐变边框</option>
                        <option value="vintage">复古相框</option>
                        <option value="polaroid">拍立得</option>
                        <option value="fluffy-white">毛绒绒·奶白</option>
                        <option value="fluffy-camel">毛绒绒·浅驼</option>
                        <option value="fluffy-pink">毛绒绒·樱花粉</option>
                    </select>
                </div>
                <div class="prop-item">
                    <label>阴影类型</label>
                    <select id="shadow-type" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="none">无阴影</option>
                        <option value="soft">柔和阴影</option>
                        <option value="strong">强烈阴影</option>
                        <option value="long">长投影</option>
                        <option value="inner">内阴影</option>
                    </select>
                </div>
                <div class="prop-item">
                    <label>边框宽度</label>
                    <input type="range" min="10" max="100" value="30" id="frame-width">
                    <span id="frame-width-value" style="color:#3b82f6;">30px</span>
                </div>
                <button id="apply-frame" class="primary-btn" style="width:100%; margin-top:10px;">应用效果</button>
                <p style="font-size:11px; color:#888; margin-top:10px;">提示：选择拍立得效果时，底部边框会更宽以模拟拍立得相纸。毛绒绒风格适合宠物、儿童、软萌风图片。</p>
`;

            document.getElementById('frame-width').addEventListener('input', (e) => {
                document.getElementById('frame-width-value').textContent = e.target.value + 'px';
            });

            document.getElementById('apply-frame').addEventListener('click', () => {
                const frameShape = document.getElementById('frame-shape').value;
                const frameType = document.getElementById('frame-type').value;
                const shadowType = document.getElementById('shadow-type').value;
                const frameWidth = parseInt(document.getElementById('frame-width').value);
                this.applyFrame(frameShape, frameType, shadowType, frameWidth);
            });
        } else if (tool === 'icon-gen') {
            // 从 localStorage 读取保存的 API 配置
            const savedApiKey = localStorage.getItem('iconGenApiKey') || '';
            const savedApiUrl = localStorage.getItem('iconGenApiUrl') || 'https://yunwu.ai/v1beta/models/gemini-2.5-flash-image-preview:generateContent';

            panel.innerHTML = `
                <div class="prop-item">
                    <label>图标预览</label>
                    <div id="icon-preview-wrapper" style="display:flex; justify-content:center; align-items:center; background:#1a1a1a; border:1px solid #333; border-radius:4px; padding:8px; margin-top:5px;">
                        <canvas id="icon-preview-canvas" width="240" height="240"></canvas>
                    </div>
                </div>

                <div class="prop-item">
                    <label>API Key</label>
                    <input type="password" id="api-key" value="${savedApiKey}" placeholder="输入 API Key" 
                        style="width:100%; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px; padding:6px; margin-top:4px; font-size:12px;">
                    <p style="font-size:10px; color:#888; margin-top:4px;">
                        推荐 <a href="https://yunwu.ai" target="_blank" style="color:#3b82f6;">云雾AI</a> Gemini 2.5 Flash 接口
                    </p>
                </div>

                <div class="prop-item">
                    <label>图标描述</label>
                    <textarea id="ai-description" placeholder="例如：一个渐变色彩的相机图标，现代简约风格"
                        style="width:100%; height:60px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px; padding:6px; font-size:12px; resize:vertical; margin-top:4px;"></textarea>
                    <div style="display:flex; gap:8px; margin-top:6px;">
                        <button id="btn-generate-icon" class="primary-btn" style="flex:1;">✨ AI 生成</button>
                        <button id="upload-icon" class="secondary-btn" style="flex:1;">📁 上传</button>
                    </div>
                </div>

                <div class="prop-item">
                    <label style="color:#34a853;">打包下载</label>
                    <p style="font-size:10px; color:#888; margin:4px 0;">生成 16×16, 32×32, 48×48, 128×128</p>
                    <button id="btn-download-icons" class="primary-btn" style="width:100%; background:#34a853; margin-top:4px;">📦 下载图标包</button>
                </div>
`;

            document.getElementById('upload-icon').addEventListener('click', () => {
                this.uploadAndCropIcon();
            });

            document.getElementById('btn-generate-icon').addEventListener('click', () => {
                const description = document.getElementById('ai-description').value;
                this.generateIconWithAI(description);
            });

            document.getElementById('btn-download-icons').addEventListener('click', () => {
                this.downloadIcons();
            });

            document.getElementById('api-key').addEventListener('input', (e) => {
                localStorage.setItem('iconGenApiKey', e.target.value);
            });
        } else {
            // 检查是否选中了文字对象
            const activeObj = canvas.getActiveObject();
            if (activeObj && activeObj.type === 'i-text') {
                // 获取当前字体的显示名称
                const fontStacks = this._getFontStacks();
                const currentFontKey = Object.keys(fontStacks).find(key =>
                    fontStacks[key] === activeObj.fontFamily
                ) || 'default';

                panel.innerHTML = `
                    <div class="prop-item">
                        <label>字体选择</label>
                        <select id="text-font" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                            <option value="default" ${currentFontKey === 'default' ? 'selected' : ''}>系统默认</option>
                            <option value="heiti" ${currentFontKey === 'heiti' ? 'selected' : ''}>黑体</option>
                            <option value="kaiti" ${currentFontKey === 'kaiti' ? 'selected' : ''}>楷体</option>
                            <option value="songti" ${currentFontKey === 'songti' ? 'selected' : ''}>宋体</option>
                            <option value="handwrite" ${currentFontKey === 'handwrite' ? 'selected' : ''}>手写体</option>
                            <option value="mono" ${currentFontKey === 'mono' ? 'selected' : ''}>等宽字体</option>
                        </select>
                    </div>
                    <div class="prop-item">
                        <label>预设样式</label>
                        <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px; margin-top:6px;">
                            <button class="preset-style-btn" data-style="internal" style="padding:10px 8px; background:#2a2a2a; border:2px dashed #d32f2f; border-radius:6px; color:#bdbdbd; cursor:pointer; font-size:11px; transition:all 0.2s ease; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:16px;">📄</span>
                                <span>内部资料</span>
                            </button>
                            <button class="preset-style-btn" data-style="secret" style="padding:10px 8px; background:#c62828; border:2px solid #c62828; border-radius:6px; color:#ffffff; cursor:pointer; font-size:11px; font-weight:bold; transition:all 0.2s ease; display:flex; flex-direction:column; align-items:center; gap:4px; box-shadow:0 2px 4px rgba(198,40,40,0.3);">
                                <span style="font-size:16px;">🔒</span>
                                <span>保密</span>
                            </button>
                            <button class="preset-style-btn" data-style="top-secret" style="padding:10px 8px; background:#2a2a2a; border:2px solid #b71c1c; border-radius:6px; color:#c62828; cursor:pointer; font-size:11px; font-weight:bold; transition:all 0.2s ease; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:16px;">🔴</span>
                                <span>绝密</span>
                            </button>
                            <button class="preset-style-btn" data-style="no-copy" style="padding:10px 8px; background:#2a2a2a; border:2px solid #ef6c00; border-radius:6px; color:#ff9800; cursor:pointer; font-size:11px; transition:all 0.2s ease; display:flex; flex-direction:column; align-items:center; gap:4px;">
                                <span style="font-size:16px;">🚫</span>
                                <span>严禁复制</span>
                            </button>
                        </div>
                        <p style="font-size:10px; color:#666; margin-top:8px;">点击应用预设样式，可配合下方平铺功能使用</p>
                    </div>
                    <div class="prop-item">
                        <label>字体颜色</label>
                        <input type="color" id="text-color" value="${this.toHexColor(activeObj.fill)}" style="width:100%; height:35px; border:1px solid #333; border-radius:4px; background:#2d2d2d; cursor:pointer;">
                    </div>
                    <div class="prop-item">
                        <label>字体大小</label>
                        <input type="range" min="12" max="120" value="${activeObj.fontSize}" id="text-size">
                        <span id="text-size-value" style="color:#3b82f6;">${activeObj.fontSize}px</span>
                    </div>
                    <div class="prop-item">
                        <label>透明度</label>
                        <input type="range" min="0" max="100" value="${activeObj.opacity * 100}" id="text-opacity">
                        <span id="text-opacity-value" style="color:#3b82f6;">${Math.round(activeObj.opacity * 100)}%</span>
                    </div>
                    <hr style="border:none; border-top:1px solid #444; margin:15px 0;">
                    <div class="prop-item">
                        <label style="color:#34a853; font-weight:bold;">📋 全图平铺水印</label>
                        <p style="font-size:11px; color:#888; margin:5px 0 10px 0;">将当前文字以平铺方式覆盖整个图片</p>
                    </div>
                    <div class="prop-item">
                        <label>旋转角度</label>
                        <input type="range" min="-45" max="45" value="-30" id="watermark-angle">
                        <span id="watermark-angle-value" style="color:#34a853;">-30°</span>
                    </div>
                    <div class="prop-item">
                        <label>水印间距</label>
                        <input type="range" min="50" max="300" value="120" id="watermark-spacing">
                        <span id="watermark-spacing-value" style="color:#34a853;">120px</span>
                    </div>
                    <button id="apply-tiled-watermark" class="primary-btn" style="width:100%; margin-top:10px; background:#34a853;">应用平铺水印</button>
`;

                // 预设样式点击事件
                panel.querySelectorAll('.preset-style-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const style = e.target.dataset.style;
                        switch (style) {
                            case 'internal':
                                activeObj.set({
                                    text: '内部资料',
                                    fill: '#9e9e9e',
                                    fontSize: 48,
                                    opacity: 0.7,
                                    fontWeight: 'bold',
                                    shadow: new fabric.Shadow({
                                        color: 'rgba(0,0,0,0.3)',
                                        blur: 8,
                                        offsetX: 2,
                                        offsetY: 2
                                    })
                                });
                                break;
                            case 'secret':
                                activeObj.set({
                                    text: '保密',
                                    fill: '#d32f2f',
                                    fontSize: 72,
                                    opacity: 0.6,
                                    fontWeight: 'bold',
                                    shadow: new fabric.Shadow({
                                        color: 'rgba(0,0,0,0.4)',
                                        blur: 12,
                                        offsetX: 3,
                                        offsetY: 3
                                    })
                                });
                                break;
                            case 'top-secret':
                                activeObj.set({
                                    text: '绝密',
                                    fill: '#b71c1c',
                                    fontSize: 72,
                                    opacity: 0.7,
                                    fontWeight: '900',
                                    shadow: new fabric.Shadow({
                                        color: 'rgba(183,28,28,0.5)',
                                        blur: 15,
                                        offsetX: 2,
                                        offsetY: 2
                                    }),
                                    stroke: '#ffcdd2',
                                    strokeWidth: 1
                                });
                                break;
                            case 'no-copy':
                                activeObj.set({
                                    text: '严禁复制',
                                    fill: '#e65100',
                                    fontSize: 56,
                                    opacity: 0.6,
                                    fontWeight: 'bold',
                                    shadow: new fabric.Shadow({
                                        color: 'rgba(0,0,0,0.4)',
                                        blur: 10,
                                        offsetX: 2,
                                        offsetY: 2
                                    }),
                                    stroke: '#ffcc80',
                                    strokeWidth: 0.5
                                });
                                break;
                        }
                        canvas.renderAll();
                        // 更新面板上的控件值
                        document.getElementById('text-color').value = this.toHexColor(activeObj.fill);
                        document.getElementById('text-size').value = activeObj.fontSize;
                        document.getElementById('text-size-value').textContent = activeObj.fontSize + 'px';
                        document.getElementById('text-opacity').value = activeObj.opacity * 100;
                        document.getElementById('text-opacity-value').textContent = Math.round(activeObj.opacity * 100) + '%';
                    });
                });

                // 字体选择
                document.getElementById('text-font').addEventListener('change', (e) => {
                    const fontFamily = this._getFontStacks()[e.target.value];
                    activeObj.set('fontFamily', fontFamily);
                    canvas.renderAll();
                });

                // 颜色选择
                document.getElementById('text-color').addEventListener('input', (e) => {
                    activeObj.set('fill', e.target.value);
                    canvas.renderAll();
                });

                // 字体大小
                document.getElementById('text-size').addEventListener('input', (e) => {
                    const size = parseInt(e.target.value);
                    activeObj.set('fontSize', size);
                    document.getElementById('text-size-value').textContent = size + 'px';
                    canvas.renderAll();
                });

                // 透明度
                document.getElementById('text-opacity').addEventListener('input', (e) => {
                    const opacity = parseInt(e.target.value) / 100;
                    activeObj.set('opacity', opacity);
                    document.getElementById('text-opacity-value').textContent = Math.round(opacity * 100) + '%';
                    canvas.renderAll();
                });

                // 水印旋转角度
                document.getElementById('watermark-angle').addEventListener('input', (e) => {
                    document.getElementById('watermark-angle-value').textContent = e.target.value + '°';
                });

                // 水印间距
                document.getElementById('watermark-spacing').addEventListener('input', (e) => {
                    document.getElementById('watermark-spacing-value').textContent = e.target.value + 'px';
                });

                // 应用平铺水印
                document.getElementById('apply-tiled-watermark').addEventListener('click', () => {
                    const textContent = activeObj.text;
                    const fontFamily = activeObj.fontFamily;
                    const color = activeObj.fill;
                    const opacity = activeObj.opacity;
                    const fontSize = activeObj.fontSize;
                    const angle = parseInt(document.getElementById('watermark-angle').value);
                    const spacing = parseInt(document.getElementById('watermark-spacing').value);

                    // 移除原始文字对象
                    canvas.remove(activeObj);

                    // 应用平铺水印
                    this.applyTiledWatermark(textContent, fontFamily, color, opacity, fontSize, angle, spacing);
                });
            } else if (activeObj && activeObj.type === 'image' && activeObj !== canvas.getObjects()[0]) {
                // 图片水印的属性控制
                panel.innerHTML = `
                    <div class="prop-item">
                        <label>透明度</label>
                        <input type="range" min="0" max="100" value="${activeObj.opacity * 100}" id="watermark-opacity">
                        <span id="watermark-opacity-value" style="color:#3b82f6;">${Math.round(activeObj.opacity * 100)}%</span>
                    </div>
                    <div class="prop-item">
                        <label>缩放</label>
                        <input type="range" min="10" max="200" value="${activeObj.scaleX * 100}" id="watermark-scale">
                        <span id="watermark-scale-value" style="color:#3b82f6;">${Math.round(activeObj.scaleX * 100)}%</span>
                    </div>
`;

                document.getElementById('watermark-opacity').addEventListener('input', (e) => {
                    const opacity = parseInt(e.target.value) / 100;
                    activeObj.set('opacity', opacity);
                    document.getElementById('watermark-opacity-value').textContent = Math.round(opacity * 100) + '%';
                    canvas.renderAll();
                });

                document.getElementById('watermark-scale').addEventListener('input', (e) => {
                    const scale = parseInt(e.target.value) / 100;
                    activeObj.set({ scaleX: scale, scaleY: scale });
                    document.getElementById('watermark-scale-value').textContent = Math.round(scale * 100) + '%';
                    canvas.renderAll();
                });
            } else if (activeObj && (activeObj.type === 'rect' || activeObj.type === 'circle' || activeObj.type === 'path')) {
                // 图图标注的属性控制
                panel.innerHTML = `
                    <div class="prop-item">
                        <label>线条颜色</label>
                        <input type="color" id="shape-stroke" value="${this.toHexColor(activeObj.stroke)}" style="width:100%; height:35px; border:1px solid #333; border-radius:4px; background:#2d2d2d; cursor:pointer;">
                    </div>
                    <div class="prop-item">
                        <label>线条粗细</label>
                        <input type="range" min="1" max="20" value="${activeObj.strokeWidth}" id="shape-width">
                        <span id="shape-width-value" style="color:#3b82f6;">${activeObj.strokeWidth}px</span>
                    </div>
`;

                document.getElementById('shape-stroke').addEventListener('input', (e) => {
                    activeObj.set('stroke', e.target.value);
                    canvas.renderAll();
                });

                document.getElementById('shape-width').addEventListener('input', (e) => {
                    const width = parseInt(e.target.value);
                    activeObj.set('strokeWidth', width);
                    document.getElementById('shape-width-value').textContent = width + 'px';
                    canvas.renderAll();
                });
            } else {
                panel.innerHTML = '<p class="empty-hint">选中元素以编辑属性</p>';
            }
        }
    },

    // ========== OCR 文字识别功能 ==========
    initOCR() {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先导入图片');
            this.activate('select');
            return;
        }

        // 检查是否已配置 API 凭证
        const apiKey = localStorage.getItem('ocrApiKey');
        const secretKey = localStorage.getItem('ocrSecretKey');

        if (!apiKey || !secretKey) {
            // 显示配置模态框
            this.showOCRConfigModal();
        } else {
            // 已配置，直接显示 OCR 操作面板
            this.updatePropertyPanel('ocr');
        }

        // 设置 OCR 模态框事件
        this.setupOCRModalEvents();
    },

    showOCRConfigModal() {
        const modal = document.getElementById('ocr-config-modal');
        if (modal) {
            // 加载已保存的配置
            const apiKeyInput = document.getElementById('ocr-api-key');
            const secretKeyInput = document.getElementById('ocr-secret-key');
            const savedApiKey = localStorage.getItem('ocrApiKey') || '';
            const savedSecretKey = localStorage.getItem('ocrSecretKey') || '';

            if (apiKeyInput) apiKeyInput.value = savedApiKey;
            if (secretKeyInput) secretKeyInput.value = savedSecretKey;

            modal.style.display = 'flex';
        }
    },

    hideOCRConfigModal() {
        const modal = document.getElementById('ocr-config-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    setupOCRModalEvents() {
        // 避免重复绑定事件
        if (this._ocrEventsSetup) return;
        this._ocrEventsSetup = true;

        // 配置模态框事件
        const configModal = document.getElementById('ocr-config-modal');
        const configClose = document.getElementById('ocr-config-close');
        const saveConfig = document.getElementById('ocr-save-config');
        const helpToggle = document.getElementById('ocr-help-toggle');
        const helpContent = document.getElementById('ocr-help-content');

        if (configClose) {
            configClose.addEventListener('click', () => this.hideOCRConfigModal());
        }

        if (configModal) {
            configModal.addEventListener('click', (e) => {
                if (e.target === configModal) this.hideOCRConfigModal();
            });
        }

        if (saveConfig) {
            saveConfig.addEventListener('click', () => {
                const apiKey = document.getElementById('ocr-api-key').value.trim();
                const secretKey = document.getElementById('ocr-secret-key').value.trim();

                if (!apiKey || !secretKey) {
                    alert('请填写完整的 API Key 和 Secret Key');
                    return;
                }

                // 保存到 localStorage
                localStorage.setItem('ocrApiKey', apiKey);
                localStorage.setItem('ocrSecretKey', secretKey);
                // 清除旧的 token，强制重新获取
                localStorage.removeItem('ocrAccessToken');
                localStorage.removeItem('ocrTokenExpiry');

                alert('配置保存成功！');
                this.hideOCRConfigModal();
                this.updatePropertyPanel('ocr');
            });
        }

        if (helpToggle && helpContent) {
            helpToggle.addEventListener('click', () => {
                const isVisible = helpContent.style.display !== 'none';
                helpContent.style.display = isVisible ? 'none' : 'block';
                const icon = helpToggle.querySelector('.ocr-toggle-icon');
                if (icon) {
                    icon.classList.toggle('expanded', !isVisible);
                }
            });
        }

        // 结果模态框事件
        const resultModal = document.getElementById('ocr-result-modal');
        const resultClose = document.getElementById('ocr-result-close');
        const closeResult = document.getElementById('ocr-close-result');
        const copyResult = document.getElementById('ocr-copy-result');

        const hideResultModal = () => {
            if (resultModal) resultModal.style.display = 'none';
        };

        if (resultClose) {
            resultClose.addEventListener('click', hideResultModal);
        }

        if (closeResult) {
            closeResult.addEventListener('click', hideResultModal);
        }

        if (resultModal) {
            resultModal.addEventListener('click', (e) => {
                if (e.target === resultModal) hideResultModal();
            });
        }

        if (copyResult) {
            copyResult.addEventListener('click', async () => {
                const resultText = document.getElementById('ocr-result-text');
                if (resultText && resultText.value) {
                    try {
                        await navigator.clipboard.writeText(resultText.value);
                        const originalText = copyResult.textContent;
                        copyResult.textContent = '✓ 已复制';
                        setTimeout(() => {
                            copyResult.textContent = originalText;
                        }, 2000);
                    } catch (err) {
                        console.error('复制失败:', err);
                        alert('复制失败，请手动复制');
                    }
                }
            });
        }
    },

    async getOCRAccessToken() {
        // 检查缓存的 token 是否有效
        const cachedToken = localStorage.getItem('ocrAccessToken');
        const tokenExpiry = localStorage.getItem('ocrTokenExpiry');

        if (cachedToken && tokenExpiry) {
            const expiryTime = parseInt(tokenExpiry);
            // 提前 1 小时刷新 token
            if (Date.now() < expiryTime - 3600000) {
                return cachedToken;
            }
        }

        // 获取新 token
        const apiKey = localStorage.getItem('ocrApiKey');
        const secretKey = localStorage.getItem('ocrSecretKey');

        if (!apiKey || !secretKey) {
            throw new Error('请先配置 API Key 和 Secret Key');
        }

        // 通过 background script 发送请求以绕过 CORS
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'getAccessToken',
                apiKey: apiKey,
                secretKey: secretKey
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response && response.success) {
                    const accessToken = response.accessToken;
                    const expiresIn = response.expiresIn || 2592000;

                    // 缓存 token
                    localStorage.setItem('ocrAccessToken', accessToken);
                    localStorage.setItem('ocrTokenExpiry', String(Date.now() + expiresIn * 1000));

                    resolve(accessToken);
                } else {
                    reject(new Error(response ? response.error : '获取 Token 失败'));
                }
            });
        });
    },

    async callOCRAPI() {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先导入图片');
            return;
        }

        const btn = document.getElementById('ocr-recognize-btn');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '识别中...';
        }

        try {
            // 获取 access token
            const accessToken = await this.getOCRAccessToken();

            // 将 canvas 导出为 base64 图片数据
            const dataURL = canvas.toDataURL({
                format: 'png',
                quality: 1
            });

            // 去掉 data:image/png;base64, 前缀
            const base64Data = dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');

            // 通过 background script 调用百度 OCR API
            const result = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'callOCR',
                    accessToken: accessToken,
                    imageBase64: base64Data
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (response && response.success) {
                        resolve(response.result);
                    } else {
                        reject(new Error(response ? response.error : 'OCR 识别失败'));
                    }
                });
            });

            // 解析识别结果
            if (result.words_result && result.words_result.length > 0) {
                const recognizedText = result.words_result.map(item => item.words).join('\n');
                this.showOCRResult(recognizedText, result.words_result_num);
            } else {
                this.showOCRResult('未识别到文字内容', 0);
            }

        } catch (error) {
            console.error('OCR 识别失败:', error);
            alert(`OCR 识别失败: ${error.message}`);

            // 如果是 token 相关错误，清除缓存的 token
            if (error.message.includes('Token') || error.message.includes('token') || error.message.includes('API') || error.message.includes('110')) {
                localStorage.removeItem('ocrAccessToken');
                localStorage.removeItem('ocrTokenExpiry');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    showOCRResult(text, wordCount) {
        const modal = document.getElementById('ocr-result-modal');
        const resultTextarea = document.getElementById('ocr-result-text');

        if (modal && resultTextarea) {
            resultTextarea.value = text;
            modal.style.display = 'flex';
        }
    },

    // ========== AI 图像生成功能 ==========
    initAIGen() {
        // 检查是否已配置 API Token
        const apiToken = localStorage.getItem('aigenApiToken');

        if (!apiToken) {
            // 显示配置模态框
            this.showAIGenConfigModal();
        } else {
            // 已配置，直接显示 AI 生成操作面板
            this.updatePropertyPanel('ai-gen');
        }

        // 设置 AI 生成模态框事件
        this.setupAIGenModalEvents();
    },

    showAIGenConfigModal() {
        const modal = document.getElementById('aigen-config-modal');
        if (modal) {
            // 加载已保存的配置
            const tokenInput = document.getElementById('aigen-api-token');
            const savedToken = localStorage.getItem('aigenApiToken') || '';

            if (tokenInput) tokenInput.value = savedToken;

            modal.style.display = 'flex';
        }
    },

    hideAIGenConfigModal() {
        const modal = document.getElementById('aigen-config-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    setupAIGenModalEvents() {
        // 避免重复绑定事件
        if (this._aigenEventsSetup) return;
        this._aigenEventsSetup = true;

        // 配置模态框事件
        const configModal = document.getElementById('aigen-config-modal');
        const configClose = document.getElementById('aigen-config-close');
        const saveConfig = document.getElementById('aigen-save-config');
        const helpToggle = document.getElementById('aigen-help-toggle');
        const helpContent = document.getElementById('aigen-help-content');

        if (configClose) {
            configClose.addEventListener('click', () => this.hideAIGenConfigModal());
        }

        if (configModal) {
            configModal.addEventListener('click', (e) => {
                if (e.target === configModal) this.hideAIGenConfigModal();
            });
        }

        if (saveConfig) {
            saveConfig.addEventListener('click', () => {
                const apiToken = document.getElementById('aigen-api-token').value.trim();

                if (!apiToken) {
                    alert('请填写 API Token');
                    return;
                }

                // 保存到 localStorage
                localStorage.setItem('aigenApiToken', apiToken);

                alert('配置保存成功！');
                this.hideAIGenConfigModal();
                this.updatePropertyPanel('ai-gen');
            });
        }

        if (helpToggle && helpContent) {
            helpToggle.addEventListener('click', () => {
                const isVisible = helpContent.style.display !== 'none';
                helpContent.style.display = isVisible ? 'none' : 'block';
                const icon = helpToggle.querySelector('.ocr-toggle-icon');
                if (icon) {
                    icon.classList.toggle('expanded', !isVisible);
                }
            });
        }

        // 结果模态框事件
        const resultModal = document.getElementById('aigen-result-modal');
        const resultClose = document.getElementById('aigen-result-close');
        const closeResult = document.getElementById('aigen-close-result');
        const useImage = document.getElementById('aigen-use-image');

        const hideResultModal = () => {
            if (resultModal) resultModal.style.display = 'none';
        };

        if (resultClose) {
            resultClose.addEventListener('click', hideResultModal);
        }

        if (closeResult) {
            closeResult.addEventListener('click', hideResultModal);
        }

        if (resultModal) {
            resultModal.addEventListener('click', (e) => {
                if (e.target === resultModal) hideResultModal();
            });
        }

        if (useImage) {
            useImage.addEventListener('click', () => {
                const resultImage = document.getElementById('aigen-result-image');
                if (resultImage && resultImage.src) {
                    this.loadAIGenImage(resultImage.src);
                    hideResultModal();
                }
            });
        }
    },

    async callAIGenAPI(prompt, size = '1024x1024') {
        const apiToken = localStorage.getItem('aigenApiToken');
        if (!apiToken) {
            alert('请先配置 API Token');
            this.showAIGenConfigModal();
            return;
        }

        const btn = document.getElementById('aigen-generate-btn');
        const originalText = btn ? btn.textContent : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = '生成中...';
        }

        // 显示结果模态框和加载状态
        const resultModal = document.getElementById('aigen-result-modal');
        const loadingDiv = document.getElementById('aigen-result-loading');
        const resultImage = document.getElementById('aigen-result-image');
        const useImageBtn = document.getElementById('aigen-use-image');
        const statusText = document.getElementById('aigen-status-text');

        if (resultModal) resultModal.style.display = 'flex';
        if (loadingDiv) loadingDiv.style.display = 'block';
        if (resultImage) resultImage.style.display = 'none';
        if (useImageBtn) useImageBtn.style.display = 'none';
        if (statusText) statusText.textContent = '正在发起生成任务...';

        try {
            // 发起生成任务
            const startResult = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'startAIGeneration',
                    apiToken: apiToken,
                    prompt: prompt,
                    size: size,
                    model: 'Qwen/Qwen-Image-2512'
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    if (response && response.success) {
                        resolve(response.taskId);
                    } else {
                        reject(new Error(response ? response.error : '发起生成任务失败'));
                    }
                });
            });

            const taskId = startResult;
            if (statusText) statusText.textContent = '任务已创建，等待生成...';

            // 轮询获取结果
            const maxPolls = 60; // 最多轮询60次（5分钟）
            let pollCount = 0;

            const pollResult = async () => {
                return new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'pollAIGeneration',
                        apiToken: apiToken,
                        taskId: taskId
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }

                        if (response && response.success) {
                            resolve(response);
                        } else {
                            reject(new Error(response ? response.error : '查询任务状态失败'));
                        }
                    });
                });
            };

            while (pollCount < maxPolls) {
                await new Promise(r => setTimeout(r, 5000)); // 每5秒轮询一次
                pollCount++;

                if (statusText) statusText.textContent = `正在生成中... (${pollCount}/${maxPolls})`;

                const pollResponse = await pollResult();

                if (pollResponse.status === 'SUCCEED') {
                    // 生成成功
                    if (pollResponse.images && pollResponse.images.length > 0) {
                        const imageUrl = pollResponse.images[0];
                        if (loadingDiv) loadingDiv.style.display = 'none';
                        if (resultImage) {
                            resultImage.src = imageUrl;
                            resultImage.style.display = 'block';
                        }
                        if (useImageBtn) useImageBtn.style.display = 'inline-block';

                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = originalText;
                        }
                        return;
                    } else {
                        throw new Error('生成成功但未返回图片');
                    }
                } else if (pollResponse.status === 'FAILED') {
                    throw new Error(pollResponse.message || '图像生成失败');
                }
                // 其他状态继续轮询
            }

            throw new Error('生成超时，请稍后重试');

        } catch (error) {
            console.error('AI 图像生成失败:', error);

            if (loadingDiv) loadingDiv.style.display = 'none';
            if (statusText) statusText.textContent = '';

            // 保持模态框打开并显示错误
            alert(`AI 图像生成失败: ${error.message}`);

            // 如果是 token 相关错误，提示重新配置
            if (error.message.includes('Token') || error.message.includes('token') || error.message.includes('401') || error.message.includes('认证')) {
                localStorage.removeItem('aigenApiToken');
                this.updatePropertyPanel('ai-gen');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    },

    async loadAIGenImage(imageUrl) {
        try {
            // 通过 background script 下载图片，绕过 CORS
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    action: 'fetchImageAsBase64',
                    imageUrl: imageUrl
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (response && response.success) {
                        resolve(response.dataUrl);
                    } else {
                        reject(new Error(response ? response.error : '下载图片失败'));
                    }
                });
            });

            const dataUrl = response;

            fabric.Image.fromURL(dataUrl, (img) => {
                if (!img) {
                    alert('图片加载失败，请重试');
                    return;
                }

                // 确保画布已初始化并显示
                const welcomeScreen = document.getElementById('welcome-screen');
                const canvasWrapper = document.getElementById('canvas-wrapper');
                const btnReset = document.getElementById('btn-reset');
                const btnCopy = document.getElementById('btn-copy');
                const btnDownload = document.getElementById('btn-download');
                const exportControls = document.querySelector('.export-controls');

                if (!window.canvas) {
                    window.canvas = new fabric.Canvas('main-canvas', {
                        backgroundColor: '#1a1a1a',
                        preserveObjectStacking: true,
                        stopContextMenu: true
                    });
                }

                if (welcomeScreen) welcomeScreen.style.display = 'none';
                if (canvasWrapper) canvasWrapper.style.display = 'block';
                if (btnReset) btnReset.style.display = 'block';
                if (btnCopy) btnCopy.style.display = 'block';
                if (btnDownload) btnDownload.style.display = 'block';
                if (exportControls) exportControls.style.display = 'flex';

                // 清空画布
                canvas.clear();

                // 调整尺寸以适应画布区域
                const dropZone = document.getElementById('drop-zone');
                const maxWidth = dropZone ? dropZone.offsetWidth - 100 : 800;
                const maxHeight = dropZone ? dropZone.offsetHeight - 100 : 600;

                let scale = 1;
                if (img.width > maxWidth || img.height > maxHeight) {
                    scale = Math.min(maxWidth / img.width, maxHeight / img.height);
                }

                canvas.setDimensions({ width: img.width * scale, height: img.height * scale });
                img.scale(scale);

                canvas.add(img);
                canvas.centerObject(img);
                canvas.setActiveObject(img);
                canvas.renderAll();

                // 添加到历史记录
                if (typeof historyManager !== 'undefined') {
                    historyManager.clear();
                    historyManager.push(canvas);
                }

                alert('✅ 图片已加载到画布，可以开始编辑！');
            });
        } catch (error) {
            console.error('加载图片失败:', error);
            alert(`加载图片失败: ${error.message}`);
        }
    },

    // ==================== Magic Eraser (消除笔) ====================

    eraserMaskCanvas: null,
    eraserMaskCtx: null,
    eraserBrushSize: 30,
    eraserIsDrawing: false,
    eraserBrushPreview: null,

    initMagicEraser() {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) {
            alert('请先导入图片');
            this.activate('select');
            return;
        }

        // 禁用画布选择
        canvas.selection = false;
        canvas.forEachObject(obj => {
            obj.selectable = false;
            obj.evented = false;
        });

        // 创建掩码层 Canvas
        this.createEraserMaskLayer();

        // 创建画笔预览元素
        this.createBrushPreview();

        // 绑定事件
        this.bindEraserEvents();

        this.updatePropertyPanel('magic-eraser');
    },

    createEraserMaskLayer() {
        // 移除已存在的掩码层
        const existingMask = document.getElementById('eraser-mask-canvas');
        if (existingMask) existingMask.remove();

        const canvasWrapper = document.getElementById('canvas-wrapper');
        const fabricCanvas = document.querySelector('.canvas-container');

        if (!fabricCanvas) return;

        // 获取 fabric canvas 的位置和尺寸
        const rect = fabricCanvas.getBoundingClientRect();

        this.eraserMaskCanvas = document.createElement('canvas');
        this.eraserMaskCanvas.id = 'eraser-mask-canvas';
        this.eraserMaskCanvas.width = canvas.width;
        this.eraserMaskCanvas.height = canvas.height;
        this.eraserMaskCanvas.style.cssText = `
            position: absolute;
            left: ${fabricCanvas.offsetLeft}px;
            top: ${fabricCanvas.offsetTop}px;
            width: ${canvas.width}px;
            height: ${canvas.height}px;
            cursor: crosshair;
            z-index: 100;
            pointer-events: auto;
        `;

        this.eraserMaskCtx = this.eraserMaskCanvas.getContext('2d');
        this.eraserMaskCtx.fillStyle = 'black';
        this.eraserMaskCtx.fillRect(0, 0, canvas.width, canvas.height);

        canvasWrapper.appendChild(this.eraserMaskCanvas);
    },

    createBrushPreview() {
        // 移除已存在的预览
        const existing = document.getElementById('eraser-brush-preview');
        if (existing) existing.remove();

        this.eraserBrushPreview = document.createElement('div');
        this.eraserBrushPreview.id = 'eraser-brush-preview';
        this.eraserBrushPreview.style.cssText = `
            position: fixed;
            width: ${this.eraserBrushSize}px;
            height: ${this.eraserBrushSize}px;
            border-radius: 50%;
            background: rgba(255, 80, 80, 0.3);
            border: 2px solid rgba(255, 80, 80, 0.8);
            pointer-events: none;
            z-index: 9999;
            display: none;
            transform: translate(-50%, -50%);
        `;
        document.body.appendChild(this.eraserBrushPreview);
    },

    bindEraserEvents() {
        if (!this.eraserMaskCanvas) return;

        const maskCanvas = this.eraserMaskCanvas;

        this._eraserMouseDown = (e) => {
            this.eraserIsDrawing = true;
            this.drawEraserBrush(e);
        };

        this._eraserMouseMove = (e) => {
            // 更新画笔预览位置
            if (this.eraserBrushPreview) {
                this.eraserBrushPreview.style.left = e.clientX + 'px';
                this.eraserBrushPreview.style.top = e.clientY + 'px';
                this.eraserBrushPreview.style.display = 'block';
            }

            if (this.eraserIsDrawing) {
                this.drawEraserBrush(e);
            }
        };

        this._eraserMouseUp = () => {
            this.eraserIsDrawing = false;
        };

        this._eraserMouseLeave = () => {
            this.eraserIsDrawing = false;
            if (this.eraserBrushPreview) {
                this.eraserBrushPreview.style.display = 'none';
            }
        };

        maskCanvas.addEventListener('mousedown', this._eraserMouseDown);
        maskCanvas.addEventListener('mousemove', this._eraserMouseMove);
        maskCanvas.addEventListener('mouseup', this._eraserMouseUp);
        maskCanvas.addEventListener('mouseleave', this._eraserMouseLeave);
    },

    drawEraserBrush(e) {
        if (!this.eraserMaskCtx || !this.eraserMaskCanvas) return;

        const rect = this.eraserMaskCanvas.getBoundingClientRect();
        const scaleX = this.eraserMaskCanvas.width / rect.width;
        const scaleY = this.eraserMaskCanvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // 白色表示需要修复的区域
        this.eraserMaskCtx.fillStyle = 'white';
        this.eraserMaskCtx.beginPath();
        this.eraserMaskCtx.arc(x, y, this.eraserBrushSize / 2, 0, Math.PI * 2);
        this.eraserMaskCtx.fill();
    },

    clearEraserMask() {
        if (this.eraserMaskCtx && this.eraserMaskCanvas) {
            this.eraserMaskCtx.fillStyle = 'black';
            this.eraserMaskCtx.fillRect(0, 0, this.eraserMaskCanvas.width, this.eraserMaskCanvas.height);
        }
    },

    cleanupMagicEraser() {
        // 移除掩码层
        const maskCanvas = document.getElementById('eraser-mask-canvas');
        if (maskCanvas) maskCanvas.remove();

        // 移除画笔预览
        const preview = document.getElementById('eraser-brush-preview');
        if (preview) preview.remove();

        // 清理事件
        if (this.eraserMaskCanvas) {
            this.eraserMaskCanvas.removeEventListener('mousedown', this._eraserMouseDown);
            this.eraserMaskCanvas.removeEventListener('mousemove', this._eraserMouseMove);
            this.eraserMaskCanvas.removeEventListener('mouseup', this._eraserMouseUp);
            this.eraserMaskCanvas.removeEventListener('mouseleave', this._eraserMouseLeave);
        }

        this.eraserMaskCanvas = null;
        this.eraserMaskCtx = null;
        this.eraserBrushPreview = null;
    },

    async applyMagicEraser() {
        if (!this.eraserMaskCanvas) {
            alert('请先涂抹要消除的区域');
            return;
        }

        // 检查是否有涂抹区域
        const maskData = this.eraserMaskCtx.getImageData(0, 0, this.eraserMaskCanvas.width, this.eraserMaskCanvas.height);
        let hasMask = false;
        for (let i = 0; i < maskData.data.length; i += 4) {
            if (maskData.data[i] > 128) { // 白色区域
                hasMask = true;
                break;
            }
        }

        if (!hasMask) {
            alert('请先用画笔涂抹要消除的区域');
            return;
        }

        const btn = document.getElementById('apply-magic-eraser');
        const progressContainer = document.getElementById('eraser-progress-container');
        const progressBar = document.getElementById('eraser-progress-bar');
        const progressText = document.getElementById('eraser-progress-text');

        if (btn) {
            btn.disabled = true;
            btn.textContent = '处理中...';
        }

        try {
            // 检查 LamaInpaint 是否可用
            if (typeof LamaInpaint === 'undefined') {
                throw new Error('LaMa 模块未加载，请刷新页面重试');
            }

            // 显示进度条
            if (progressContainer) progressContainer.style.display = 'block';

            // 加载模型
            if (progressText) progressText.textContent = '正在加载 AI 模型...';

            await LamaInpaint.loadModel((progress) => {
                if (progressBar) progressBar.style.width = progress + '%';
                if (progressText) {
                    if (progress < 100) {
                        progressText.textContent = `下载模型中... ${progress}%`;
                    } else {
                        progressText.textContent = '模型加载完成';
                    }
                }
            });

            if (progressText) progressText.textContent = 'AI 正在处理图片...';

            // 获取原始图像 Canvas
            const imageCanvas = document.createElement('canvas');
            imageCanvas.width = canvas.width;
            imageCanvas.height = canvas.height;
            const imageCtx = imageCanvas.getContext('2d');

            // 将 fabric canvas 内容绘制到临时 canvas
            const dataURL = canvas.toDataURL('image/png');
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = dataURL;
            });
            imageCtx.drawImage(img, 0, 0);

            // 执行修复
            const resultCanvas = await LamaInpaint.run(imageCanvas, this.eraserMaskCanvas);

            // 将结果放回 fabric canvas
            const resultDataURL = resultCanvas.toDataURL('image/png');

            fabric.Image.fromURL(resultDataURL, (fabricImg) => {
                // 缩放回原始尺寸
                fabricImg.scaleX = canvas.width / LamaInpaint.INPUT_SIZE;
                fabricImg.scaleY = canvas.height / LamaInpaint.INPUT_SIZE;

                canvas.clear();
                canvas.add(fabricImg);
                canvas.centerObject(fabricImg);
                canvas.renderAll();

                historyManager.push(canvas);

                // 清理
                this.cleanupMagicEraser();
                this.activate('select');

                alert('✨ 消除完成！');
            });

        } catch (error) {
            console.error('[MagicEraser] 处理失败:', error);
            alert(`消除失败: ${error.message}`);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '✨ 应用消除';
            }
            if (progressContainer) progressContainer.style.display = 'none';
        }
    }
};
