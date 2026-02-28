/**
 * 批量处理中心模块
 * 支持批量压缩、尺寸调整、旋转、格式转换
 * 不依赖 Fabric.js Canvas，直接处理图片文件
 */

// 批量处理中心全局状态
const batchProcessor = {
    files: [],
    currentTool: 'compress',
    isProcessing: false,
    processedResults: [],

    /**
     * 打开批量处理中心模态框
     */
    open() {
        const modal = document.getElementById('batch-processor-modal');
        if (!modal) {
            console.error('[BatchProcessor] 找不到模态框元素');
            return;
        }

        modal.style.display = 'flex';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // 初始化事件（只执行一次）
        if (!this._initialized) {
            this.initEvents();
            this._initialized = true;
        }

        // 重置状态
        this.resetState();
        console.log('[BatchProcessor] 批量处理中心已打开');
    },

    /**
     * 关闭批量处理中心模态框
     */
    close() {
        const modal = document.getElementById('batch-processor-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }

        // 如果正在处理，停止处理
        if (this.isProcessing) {
            this.isProcessing = false;
        }

        console.log('[BatchProcessor] 批量处理中心已关闭');
    },

    /**
     * 重置状态
     */
    resetState() {
        this.files = [];
        this.processedResults = [];
        this.isProcessing = false;
        this.currentTool = 'compress';

        // 重置UI
        this.updateFileList();
        this.updateButtons();
        this.hideProgress();

        // 重置工具选择
        document.querySelectorAll('.batch-tool-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#2d2d2d';
        });
        const defaultToolBtn = document.querySelector('.batch-tool-btn[data-tool="compress"]');
        if (defaultToolBtn) {
            defaultToolBtn.classList.add('active');
            defaultToolBtn.style.background = '#1a73e8';
        }

        // 显示压缩参数
        this.switchToolParams('compress');
    },

    /**
     * 初始化事件监听
     */
    initEvents() {
        // 关闭按钮
        const closeBtn = document.getElementById('batch-processor-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // 点击模态框外部关闭
        const modal = document.getElementById('batch-processor-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }

        // 工具切换按钮
        document.querySelectorAll('.batch-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = btn.dataset.tool;
                this.switchTool(tool, btn);
            });
        });

        // 上传区域
        const uploadArea = document.getElementById('batch-processor-upload-area');
        const fileInput = document.getElementById('batch-processor-file-input');

        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());

            // 拖拽上传
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#1a73e8';
                uploadArea.style.background = 'rgba(26, 115, 232, 0.1)';
            });

            uploadArea.addEventListener('dragleave', () => {
                uploadArea.style.borderColor = '#444';
                uploadArea.style.background = 'transparent';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#444';
                uploadArea.style.background = 'transparent';
                if (e.dataTransfer.files.length > 0) {
                    this.addFiles(e.dataTransfer.files);
                }
            });
        }

        // 文件选择
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.addFiles(e.target.files);
                }
                // 重置input以便重复选择相同文件
                fileInput.value = '';
            });
        }

        // 清空按钮
        const clearBtn = document.getElementById('batch-processor-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFiles());
        }

        // 开始处理按钮
        const startBtn = document.getElementById('batch-processor-start');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startProcessing());
        }

        // 导出按钮
        const exportBtn = document.getElementById('batch-processor-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportResults());
        }

        // 参数滑块实时更新显示值
        const compressQuality = document.getElementById('bp-compress-quality');
        if (compressQuality) {
            compressQuality.addEventListener('input', (e) => {
                const valueDisplay = document.getElementById('bp-compress-quality-value');
                if (valueDisplay) valueDisplay.textContent = e.target.value + '%';
            });
        }

        const formatQuality = document.getElementById('bp-format-quality');
        if (formatQuality) {
            formatQuality.addEventListener('input', (e) => {
                const valueDisplay = document.getElementById('bp-format-quality-value');
                if (valueDisplay) valueDisplay.textContent = e.target.value + '%';
            });
        }

        // 裁剪参数滑块
        const cropQuality = document.getElementById('bp-crop-quality');
        if (cropQuality) {
            cropQuality.addEventListener('input', (e) => {
                const valueDisplay = document.getElementById('bp-crop-quality-value');
                if (valueDisplay) valueDisplay.textContent = e.target.value + '%';
            });
        }

        // 图框参数滑块
        const frameWidth = document.getElementById('bp-frame-width');
        if (frameWidth) {
            frameWidth.addEventListener('input', (e) => {
                const valueDisplay = document.getElementById('bp-frame-width-value');
                if (valueDisplay) valueDisplay.textContent = e.target.value + 'px';
            });
        }

        // 文本参数滑块
        const textSize = document.getElementById('bp-text-size');
        if (textSize) {
            textSize.addEventListener('input', (e) => {
                const valueDisplay = document.getElementById('bp-text-size-value');
                if (valueDisplay) valueDisplay.textContent = e.target.value + 'px';
            });
        }
    },

    /**
     * 切换工具
     */
    switchTool(tool, btnElement) {
        this.currentTool = tool;

        // 更新按钮样式
        document.querySelectorAll('.batch-tool-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = '#2d2d2d';
        });
        if (btnElement) {
            btnElement.classList.add('active');
            btnElement.style.background = '#1a73e8';
        }

        // 切换参数面板
        this.switchToolParams(tool);

        console.log(`[BatchProcessor] 切换到工具: ${tool}`);
    },

    /**
     * 切换工具参数面板
     */
    switchToolParams(tool) {
        document.querySelectorAll('.batch-processor-tool-params').forEach(panel => {
            panel.style.display = panel.dataset.tool === tool ? 'block' : 'none';
        });
    },

    /**
     * 添加文件
     */
    addFiles(fileList) {
        const imageFiles = Array.from(fileList).filter(file =>
            file.type.startsWith('image/')
        );

        if (imageFiles.length === 0) {
            alert('请选择图片文件');
            return;
        }

        // 去重（基于文件名和大小）
        imageFiles.forEach(newFile => {
            const isDuplicate = this.files.some(existingFile =>
                existingFile.name === newFile.name &&
                existingFile.size === newFile.size
            );
            if (!isDuplicate) {
                this.files.push(newFile);
            }
        });

        this.updateFileList();
        this.updateButtons();

        console.log(`[BatchProcessor] 已添加 ${imageFiles.length} 个文件，当前共 ${this.files.length} 个`);
    },

    /**
     * 清空文件
     */
    clearFiles() {
        this.files = [];
        this.processedResults = [];
        this.updateFileList();
        this.updateButtons();
        this.hideProgress();
        console.log('[BatchProcessor] 已清空文件列表');
    },

    /**
     * 更新文件列表显示
     */
    updateFileList() {
        const listContainer = document.getElementById('batch-processor-list-container');
        const imageList = document.getElementById('batch-processor-image-list');
        const countDisplay = document.getElementById('batch-processor-count');
        const uploadArea = document.getElementById('batch-processor-upload-area');

        if (countDisplay) {
            countDisplay.textContent = this.files.length;
        }

        if (this.files.length === 0) {
            if (listContainer) listContainer.style.display = 'none';
            if (uploadArea) uploadArea.style.display = 'block';
            if (imageList) imageList.innerHTML = '';
            return;
        }

        if (listContainer) listContainer.style.display = 'block';
        if (uploadArea) uploadArea.style.display = 'none';

        if (imageList) {
            imageList.innerHTML = this.files.map((file, index) => `
                <div class="batch-list-item" style="display: flex; align-items: center; padding: 10px; border-bottom: 1px solid #333;" data-index="${index}">
                    <img src="${URL.createObjectURL(file)}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; margin-right: 10px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 13px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${file.name}</div>
                        <div style="font-size: 11px; color: #888;">${this.formatFileSize(file.size)}</div>
                    </div>
                    <button class="batch-remove-btn" data-index="${index}" style="background: transparent; border: none; color: #ff6b6b; cursor: pointer; font-size: 18px; padding: 5px;">×</button>
                </div>
            `).join('');

            // 绑定删除按钮事件
            imageList.querySelectorAll('.batch-remove-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.dataset.index);
                    this.removeFile(index);
                });
            });
        }
    },

    /**
     * 移除单个文件
     */
    removeFile(index) {
        this.files.splice(index, 1);
        this.updateFileList();
        this.updateButtons();
    },

    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * 更新按钮状态
     */
    updateButtons() {
        const startBtn = document.getElementById('batch-processor-start');
        const exportBtn = document.getElementById('batch-processor-export');

        if (startBtn) {
            startBtn.disabled = this.files.length === 0 || this.isProcessing;
        }

        if (exportBtn) {
            exportBtn.disabled = this.processedResults.length === 0 || this.isProcessing;
        }
    },

    /**
     * 显示进度
     */
    showProgress() {
        const progressDiv = document.getElementById('batch-processor-progress');
        if (progressDiv) progressDiv.style.display = 'block';
    },

    /**
     * 隐藏进度
     */
    hideProgress() {
        const progressDiv = document.getElementById('batch-processor-progress');
        if (progressDiv) progressDiv.style.display = 'none';

        const progressBar = document.getElementById('batch-processor-progress-bar');
        if (progressBar) progressBar.style.width = '0%';

        const progressText = document.getElementById('batch-processor-progress-text');
        if (progressText) progressText.textContent = '准备中...';
    },

    /**
     * 更新进度
     */
    updateProgress(current, total, message) {
        const progressBar = document.getElementById('batch-processor-progress-bar');
        const progressText = document.getElementById('batch-processor-progress-text');

        const percentage = Math.round((current / total) * 100);

        if (progressBar) progressBar.style.width = percentage + '%';
        if (progressText) progressText.textContent = message || `处理中... ${current}/${total}`;
    },

    /**
     * 开始批量处理
     */
    async startProcessing() {
        if (this.files.length === 0 || this.isProcessing) return;

        this.isProcessing = true;
        this.processedResults = [];
        this.updateButtons();
        this.showProgress();

        console.log(`[BatchProcessor] 开始批量处理，工具: ${this.currentTool}，文件数: ${this.files.length}`);

        try {
            for (let i = 0; i < this.files.length; i++) {
                if (!this.isProcessing) break; // 允许中断

                const file = this.files[i];
                this.updateProgress(i + 1, this.files.length, `处理中... ${file.name}`);

                const result = await this.processFile(file);
                if (result) {
                    this.processedResults.push(result);
                }

                // 小延迟避免阻塞UI
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            this.updateProgress(this.files.length, this.files.length, '处理完成！');
            console.log(`[BatchProcessor] 批量处理完成，成功 ${this.processedResults.length}/${this.files.length}`);

            if (this.processedResults.length > 0) {
                alert(`✅ 处理完成！\n成功: ${this.processedResults.length}/${this.files.length}\n\n点击「导出 ZIP」下载结果`);
            }

        } catch (error) {
            console.error('[BatchProcessor] 批量处理出错:', error);
            alert('处理过程中出错: ' + error.message);
        } finally {
            this.isProcessing = false;
            this.updateButtons();
        }
    },

    /**
     * 处理单个文件
     */
    async processFile(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                // 创建 canvas 进行处理
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let outputWidth = img.width;
                let outputHeight = img.height;

                // 根据工具类型处理
                switch (this.currentTool) {
                    case 'compress':
                    case 'format':
                        // 压缩和格式转换保持原尺寸
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        break;

                    case 'resize':
                        // 尺寸调整
                        const mode = document.getElementById('bp-resize-mode').value;
                        const value = parseInt(document.getElementById('bp-resize-value').value) || 800;

                        if (mode === 'width') {
                            outputWidth = value;
                            outputHeight = (img.height / img.width) * value;
                        } else if (mode === 'height') {
                            outputHeight = value;
                            outputWidth = (img.width / img.height) * value;
                        } else if (mode === 'percent') {
                            const percent = value / 100;
                            outputWidth = img.width * percent;
                            outputHeight = img.height * percent;
                        }

                        canvas.width = outputWidth;
                        canvas.height = outputHeight;
                        ctx.drawImage(img, 0, 0, outputWidth, outputHeight);
                        break;

                    case 'crop':
                        // 批量裁剪 - 居中裁剪
                        const cropRatio = document.getElementById('bp-crop-ratio').value;
                        let targetRatio = 1;
                        
                        switch (cropRatio) {
                            case '1:1': targetRatio = 1; break;
                            case '4:3': targetRatio = 4/3; break;
                            case '3:4': targetRatio = 3/4; break;
                            case '16:9': targetRatio = 16/9; break;
                            case '9:16': targetRatio = 9/16; break;
                        }
                        
                        const imgRatio = img.width / img.height;
                        let cropWidth, cropHeight, cropX, cropY;
                        
                        if (imgRatio > targetRatio) {
                            // 图片更宽，按高度裁剪
                            cropHeight = img.height;
                            cropWidth = img.height * targetRatio;
                            cropX = (img.width - cropWidth) / 2;
                            cropY = 0;
                        } else {
                            // 图片更高，按宽度裁剪
                            cropWidth = img.width;
                            cropHeight = img.width / targetRatio;
                            cropX = 0;
                            cropY = (img.height - cropHeight) / 2;
                        }
                        
                        canvas.width = cropWidth;
                        canvas.height = cropHeight;
                        ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                        break;

                    case 'frame':
                        // 批量图框阴影
                        const frameType = document.getElementById('bp-frame-type').value;
                        const frameWidth = parseInt(document.getElementById('bp-frame-width').value) || 30;
                        
                        canvas.width = img.width + frameWidth * 2;
                        canvas.height = img.height + frameWidth * 2;
                        
                        // 根据图框类型绘制
                        switch (frameType) {
                            case 'white':
                                // 简约白边
                                ctx.fillStyle = '#ffffff';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, frameWidth, frameWidth);
                                break;
                                
                            case 'black':
                                // 简约黑边
                                ctx.fillStyle = '#1a1a1a';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, frameWidth, frameWidth);
                                break;
                                
                            case 'polaroid':
                                // 拍立得风格
                                ctx.fillStyle = '#f5f5f5';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                // 底部留白更多
                                const bottomMargin = frameWidth * 2;
                                canvas.height = img.height + frameWidth + bottomMargin;
                                ctx.fillStyle = '#f5f5f5';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, frameWidth, frameWidth);
                                // 添加阴影效果
                                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                                ctx.shadowBlur = 15;
                                ctx.shadowOffsetX = 5;
                                ctx.shadowOffsetY = 5;
                                break;
                                
                            case 'film':
                                // 胶片边框
                                ctx.fillStyle = '#0a0a0a';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                // 胶片齿孔效果
                                ctx.fillStyle = '#333';
                                const sprocketSize = frameWidth / 3;
                                for (let i = 0; i < canvas.height; i += sprocketSize * 2) {
                                    ctx.fillRect(2, i, sprocketSize, sprocketSize);
                                    ctx.fillRect(canvas.width - sprocketSize - 2, i, sprocketSize, sprocketSize);
                                }
                                ctx.drawImage(img, frameWidth, frameWidth);
                                break;
                                
                            case 'gradient':
                                // 渐变边框
                                const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                                gradient.addColorStop(0, '#667eea');
                                gradient.addColorStop(0.5, '#764ba2');
                                gradient.addColorStop(1, '#f093fb');
                                ctx.fillStyle = gradient;
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, frameWidth, frameWidth);
                                break;
                                
                            case 'vintage':
                                // 复古相框
                                ctx.fillStyle = '#8b7355';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                // 内边框
                                ctx.fillStyle = '#d4c4a8';
                                ctx.fillRect(frameWidth/2, frameWidth/2, canvas.width - frameWidth, canvas.height - frameWidth);
                                ctx.drawImage(img, frameWidth, frameWidth);
                                break;
                                
                            default:
                                ctx.fillStyle = '#ffffff';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, frameWidth, frameWidth);
                        }
                        break;

                    case 'text':
                        // 批量添加文本
                        const textContent = document.getElementById('bp-text-content').value || '';
                        const textPosition = document.getElementById('bp-text-position').value;
                        const textSize = parseInt(document.getElementById('bp-text-size').value) || 24;
                        const textColor = document.getElementById('bp-text-color').value || '#ffffff';
                        
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                        
                        if (textContent.trim()) {
                            // 设置文字样式
                            ctx.font = `bold ${textSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
                            ctx.fillStyle = textColor;
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'alphabetic';
                            
                            // 计算文字位置
                            const padding = Math.max(20, textSize);
                            let textX, textY;
                            
                            const textMetrics = ctx.measureText(textContent);
                            const textWidth = textMetrics.width;
                            const textHeight = textSize;
                            
                            switch (textPosition) {
                                case 'top-left':
                                    textX = padding;
                                    textY = padding + textHeight * 0.8;
                                    break;
                                case 'top-right':
                                    textX = canvas.width - textWidth - padding;
                                    textY = padding + textHeight * 0.8;
                                    break;
                                case 'bottom-left':
                                    textX = padding;
                                    textY = canvas.height - padding;
                                    break;
                                case 'bottom-right':
                                    textX = canvas.width - textWidth - padding;
                                    textY = canvas.height - padding;
                                    break;
                                case 'center':
                                    textX = (canvas.width - textWidth) / 2;
                                    textY = (canvas.height + textHeight * 0.3) / 2;
                                    break;
                                default:
                                    textX = canvas.width - textWidth - padding;
                                    textY = canvas.height - padding;
                            }
                            
                            // 绘制文字阴影增强可读性
                            ctx.shadowColor = 'rgba(0,0,0,0.5)';
                            ctx.shadowBlur = 4;
                            ctx.shadowOffsetX = 1;
                            ctx.shadowOffsetY = 1;
                            
                            ctx.fillText(textContent, textX, textY);
                            
                            // 重置阴影
                            ctx.shadowColor = 'transparent';
                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                        }
                        break;

                    case 'rotate':
                        // 旋转
                        const angle = parseInt(document.getElementById('bp-rotate-angle').value) || 90;

                        if (Math.abs(angle) === 90) {
                            canvas.width = img.height;
                            canvas.height = img.width;
                        } else {
                            canvas.width = img.width;
                            canvas.height = img.height;
                        }

                        ctx.translate(canvas.width / 2, canvas.height / 2);
                        ctx.rotate(angle * Math.PI / 180);
                        ctx.drawImage(img, -img.width / 2, -img.height / 2);
                        break;

                    default:
                        canvas.width = img.width;
                        canvas.height = img.height;
                        ctx.drawImage(img, 0, 0);
                }

                // 获取输出参数
                let outputFormat = 'image/jpeg';
                let outputQuality = 0.8;
                let fileExtension = 'jpg';

                if (this.currentTool === 'compress') {
                    outputFormat = document.getElementById('bp-compress-format').value;
                    outputQuality = parseInt(document.getElementById('bp-compress-quality').value) / 100;
                    fileExtension = outputFormat === 'image/webp' ? 'webp' : 'jpg';
                } else if (this.currentTool === 'format') {
                    outputFormat = document.getElementById('bp-target-format').value;
                    outputQuality = parseInt(document.getElementById('bp-format-quality').value) / 100;
                    fileExtension = outputFormat === 'image/png' ? 'png' : (outputFormat === 'image/webp' ? 'webp' : 'jpg');
                } else if (this.currentTool === 'crop') {
                    outputFormat = document.getElementById('bp-crop-format').value;
                    outputQuality = parseInt(document.getElementById('bp-crop-quality').value) / 100;
                    fileExtension = outputFormat === 'image/png' ? 'png' : (outputFormat === 'image/webp' ? 'webp' : 'jpg');
                } else if (this.currentTool === 'frame') {
                    outputFormat = document.getElementById('bp-frame-format').value;
                    outputQuality = 0.95;
                    fileExtension = outputFormat === 'image/png' ? 'png' : (outputFormat === 'image/webp' ? 'webp' : 'jpg');
                } else if (this.currentTool === 'text') {
                    outputFormat = document.getElementById('bp-text-format').value;
                    outputQuality = 0.95;
                    fileExtension = outputFormat === 'image/png' ? 'png' : (outputFormat === 'image/webp' ? 'webp' : 'jpg');
                } else if (this.currentTool === 'rotate' || this.currentTool === 'resize') {
                    // 旋转和尺寸调整保持原格式
                    outputFormat = file.type || 'image/jpeg';
                    outputQuality = 0.92;
                    if (outputFormat === 'image/png') fileExtension = 'png';
                    else if (outputFormat === 'image/webp') fileExtension = 'webp';
                    else fileExtension = 'jpg';
                }

                // 导出为 Blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // 生成新文件名
                        const originalName = file.name.replace(/\.[^/.]+$/, '');
                        const newFileName = `${originalName}_processed.${fileExtension}`;

                        resolve({
                            blob: blob,
                            fileName: newFileName,
                            originalName: file.name,
                            originalSize: file.size,
                            processedSize: blob.size
                        });
                    } else {
                        reject(new Error('导出失败'));
                    }
                }, outputFormat, outputQuality);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('图片加载失败'));
            };

            img.src = url;
        });
    },

    /**
     * 导出结果为 ZIP
     */
    async exportResults() {
        if (this.processedResults.length === 0) {
            alert('没有可导出的结果');
            return;
        }

        console.log('[BatchProcessor] 开始导出 ZIP...');

        try {
            const zip = new JSZip();

            this.processedResults.forEach(result => {
                zip.file(result.fileName, result.blob);
            });

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);

            const link = document.createElement('a');
            link.href = url;
            link.download = `batch_processed_${new Date().getTime()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);

            console.log('[BatchProcessor] ZIP 导出完成');

        } catch (error) {
            console.error('[BatchProcessor] 导出失败:', error);
            alert('导出失败: ' + error.message);
        }
    }
};

// 全局函数供 tools.js 调用
function openBatchProcessor() {
    batchProcessor.open();
}

function closeBatchProcessor() {
    batchProcessor.close();
}

console.log('[BatchProcessor] 模块已加载');
