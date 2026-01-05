/**
 * Tools and Property Panels
 */

const toolManager = {
    currentTool: 'select',
    cropRect: null,
    cropOverlays: [],
    cropSizeLabel: null,
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
            case 'rect':
                this.addRect();
                break;
            case 'circle':
                this.addCircle();
                break;
            case 'arrow':
                this.addArrow();
                break;
        }
    },

    resetCanvasState() {
        canvas.isDrawingMode = false;
        canvas.selection = false;

        // 移除裁剪框
        if (this.cropRect) {
            canvas.remove(this.cropRect);
            this.cropRect = null;
        }

        // 移除所有遮罩层
        this.cropOverlays.forEach(overlay => canvas.remove(overlay));
        this.cropOverlays = [];

        // 移除尺寸标签
        if (this.cropSizeLabel) {
            canvas.remove(this.cropSizeLabel);
            this.cropSizeLabel = null;
        }

        canvas.forEachObject(obj => {
            obj.selectable = true;
            obj.evented = true;
        });
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

        // 创建裁剪框（默认占图片的 80%）
        const cropWidth = imgWidth * 0.8;
        const cropHeight = imgHeight * 0.8;
        const cropLeft = imgLeft + (imgWidth - cropWidth) / 2;
        const cropTop = imgTop + (imgHeight - cropHeight) / 2;

        // 创建四个遮罩矩形（上、下、左、右）
        // 上遮罩
        const topOverlay = new fabric.Rect({
            left: imgLeft,
            top: imgTop,
            width: imgWidth,
            height: cropTop - imgTop,
            fill: 'rgba(0, 0, 0, 0.6)',
            selectable: false,
            evented: false,
            excludeFromExport: true
        });

        // 下遮罩
        const bottomOverlay = new fabric.Rect({
            left: imgLeft,
            top: cropTop + cropHeight,
            width: imgWidth,
            height: imgTop + imgHeight - (cropTop + cropHeight),
            fill: 'rgba(0, 0, 0, 0.6)',
            selectable: false,
            evented: false,
            excludeFromExport: true
        });

        // 左遮罩
        const leftOverlay = new fabric.Rect({
            left: imgLeft,
            top: cropTop,
            width: cropLeft - imgLeft,
            height: cropHeight,
            fill: 'rgba(0, 0, 0, 0.6)',
            selectable: false,
            evented: false,
            excludeFromExport: true
        });

        // 右遮罩
        const rightOverlay = new fabric.Rect({
            left: cropLeft + cropWidth,
            top: cropTop,
            width: imgLeft + imgWidth - (cropLeft + cropWidth),
            height: cropHeight,
            fill: 'rgba(0, 0, 0, 0.6)',
            selectable: false,
            evented: false,
            excludeFromExport: true
        });

        this.cropOverlays = [topOverlay, bottomOverlay, leftOverlay, rightOverlay];
        this.cropOverlays.forEach(overlay => canvas.add(overlay));

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
                left: imgLeft,
                top: imgTop,
                width: imgWidth,
                height: finalTop - imgTop
            });

            bottomOverlay.set({
                left: imgLeft,
                top: finalTop + finalHeight,
                width: imgWidth,
                height: imgTop + imgHeight - (finalTop + finalHeight)
            });

            leftOverlay.set({
                left: imgLeft,
                top: finalTop,
                width: finalLeft - imgLeft,
                height: finalHeight
            });

            rightOverlay.set({
                left: finalLeft + finalWidth,
                top: finalTop,
                width: imgLeft + imgWidth - (finalLeft + finalWidth),
                height: finalHeight
            });

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
            case '4:3':
                newHeight = currentWidth * 3 / 4;
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
        this.updatePropertyPanel('ai-background');
    },

    async applyAiBackground(type, value) {
        const baseImage = canvas.getObjects().find(obj => obj.type === 'image');
        if (!baseImage) return;

        const btn = document.getElementById('btn-apply-ai');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'AI 识别中...';

        try {
            console.log('开始 AI 处理，类型:', type);
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

            if (!this.selfieSegmentation) {
                this.selfieSegmentation = new SelfieSegmentation({
                    locateFile: (file) => {
                        const path = `lib/mediapipe/${file}`;
                        console.log(`[AI] Loading MediaPipe file: ${file} -> ${path}`);
                        
                        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                            try {
                                const url = chrome.runtime.getURL(path);
                                console.log(`[AI] Resolved URL: ${url}`);
                                return url;
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
                console.log('AI 模型初始化成功');
            }

            const imgElement = baseImage._element;
            
            const results = await new Promise((resolve, reject) => {
                let isResolved = false;
                
                this.selfieSegmentation.onResults((res) => {
                    if (!isResolved) {
                        isResolved = true;
                        resolve(res);
                    }
                });

                this.selfieSegmentation.send({ image: imgElement })
                    .catch(err => {
                        if (!isResolved) {
                            isResolved = true;
                            reject(err);
                        }
                    });

                setTimeout(() => {
                    if (!isResolved) {
                        isResolved = true;
                        reject(new Error('AI 处理超时，请重试。'));
                    }
                }, 15000);
            });

            if (!results || !results.segmentationMask) {
                throw new Error('AI 无法识别图片中的人像');
            }

            const finalCanvas = document.createElement('canvas');
            const finalCtx = finalCanvas.getContext('2d');
            
            const width = imgElement.naturalWidth || imgElement.width;
            const height = imgElement.naturalHeight || imgElement.height;
            finalCanvas.width = width;
            finalCanvas.height = height;

            if (type === 'color') {
                finalCtx.fillStyle = value;
                finalCtx.fillRect(0, 0, width, height);
            } else if (type === 'image') {
                finalCtx.drawImage(value, 0, 0, width, height);
            }

            const portraitCanvas = document.createElement('canvas');
            const portraitCtx = portraitCanvas.getContext('2d');
            portraitCanvas.width = width;
            portraitCanvas.height = height;
            
            portraitCtx.drawImage(imgElement, 0, 0, width, height);
            portraitCtx.globalCompositeOperation = 'destination-in';
            portraitCtx.drawImage(results.segmentationMask, 0, 0, width, height);

            finalCtx.drawImage(portraitCanvas, 0, 0);

            // 4. 更新到 Fabric 画布
            const dataURL = finalCanvas.toDataURL('image/png');
            fabric.Image.fromURL(dataURL, (newImg) => {
                newImg.set({
                    left: baseImage.left,
                    top: baseImage.top,
                    scaleX: baseImage.scaleX,
                    scaleY: baseImage.scaleY,
                    angle: baseImage.angle,
                    flipX: baseImage.flipX,
                    flipY: baseImage.flipY
                });
                
                canvas.remove(baseImage);
                canvas.add(newImg);
                canvas.sendToBack(newImg);
                canvas.renderAll();
                historyManager.push(canvas);
                alert('背景替换成功！');
            });

        } catch (error) {
            console.error('AI 处理详细错误:', error);
            alert(`AI 处理失败: ${error.message || '未知错误'}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    },

    initMosaic() {
        canvas.isDrawingMode = true;

        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.width = 20;
        canvas.freeDrawingBrush.color = '#333333';

        this.updatePropertyPanel('mosaic');
    },

    addText() {
        const text = new fabric.IText('输入文字...', {
            left: 100,
            top: 100,
            fontSize: 40,
            fill: '#ffffff',
            fontFamily: 'Arial',
            textBaseline: 'alphabetic'
        });
        canvas.add(text);
        canvas.setActiveObject(text);
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

    addRect() {
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            fill: 'transparent',
            stroke: '#ff0000',
            strokeWidth: 4,
            width: 100,
            height: 100,
            cornerStyle: 'circle'
        });
        canvas.add(rect);
        canvas.setActiveObject(rect);
    },

    addCircle() {
        const circle = new fabric.Circle({
            left: 100,
            top: 100,
            fill: 'transparent',
            stroke: '#ff0000',
            strokeWidth: 4,
            radius: 50,
            cornerStyle: 'circle'
        });
        canvas.add(circle);
        canvas.setActiveObject(circle);
    },

    addArrow() {
        const path = new fabric.Path('M 0 0 L 50 0 L 40 -10 M 50 0 L 40 10', {
            left: 100,
            top: 100,
            stroke: '#ff0000',
            strokeWidth: 4,
            fill: 'transparent',
            scaleX: 2,
            scaleY: 2
        });
        canvas.add(path);
        canvas.setActiveObject(path);
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

    updatePropertyPanel(tool) {
        const panel = document.getElementById('panel-content');
        panel.innerHTML = '';

        if (tool === 'crop') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>裁剪比例</label>
                    <select id="crop-ratio" style="width:100%; padding:6px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                        <option value="free">自由比例</option>
                        <option value="1:1">1:1 (正方形)</option>
                        <option value="4:3">4:3</option>
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
        } else if (tool === 'mosaic') {
            panel.innerHTML = `
                <div class="prop-item">
                    <label>笔刷大小</label>
                    <input type="range" min="5" max="100" value="20" id="brush-size">
                </div>
            `;
            document.getElementById('brush-size').addEventListener('input', (e) => {
                canvas.freeDrawingBrush.width = parseInt(e.target.value);
            });
        } else if (tool === 'grid-slice') {
            panel.innerHTML = `
                <div class="panel-header">网格切图</div>
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
        } else if (tool === 'ai-background') {
            panel.innerHTML = `
                <div class="panel-header">AI 背景替换</div>
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
                        img.onload = () => this.applyAiBackground('image', img);
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(fileInput.files[0]);
                } else {
                    this.applyAiBackground('color', customColor || selectedColor);
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
                <div class="panel-header">旋转图片</div>
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
                <div class="panel-header">图片滤镜</div>
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
        } else {
            // 检查是否选中了文字对象
            const activeObj = canvas.getActiveObject();
            if (activeObj && activeObj.type === 'i-text') {
                panel.innerHTML = `
                    <div class="panel-header">文字属性</div>
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
                `;

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
            } else if (activeObj && activeObj.type === 'image' && activeObj !== canvas.getObjects()[0]) {
                // 图片水印的属性控制
                panel.innerHTML = `
                    <div class="panel-header">水印属性</div>
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
                    <div class="panel-header">标注属性</div>
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
    }
};
