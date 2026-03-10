/**
 * Main logic for the Image Editor
 */

window.canvas = null; // 显式声明全局 canvas
const welcomeScreen = document.getElementById('welcome-screen');
const canvasWrapper = document.getElementById('canvas-wrapper');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');
const btnDownload = document.getElementById('btn-download');

const exportControls = document.querySelector('.export-controls');
const formatSelect = document.getElementById('export-format');
const qualityWrapper = document.getElementById('quality-wrapper');
const qualityInput = document.getElementById('export-quality');
const qualityValue = document.getElementById('quality-value');
const zoomLevel = document.getElementById('zoom-level');

const CANVAS_VIEW_MARGIN = 80;

const sidebarSections = [
    {
        tag: '修整',
        title: '基础处理',
        description: '常规修图入口集中放在一起，优先覆盖最高频操作。',
        tools: ['crop', 'resize', 'compress', 'rotate', 'filter', 'frame']
    },
    {
        tag: '修复',
        title: '增强与去除',
        description: '把去印、抠除、换背景这类目标接近的功能放到同一区域。',
        tools: ['mosaic', 'remove-watermark', 'magic-eraser', 'ai-background', 'id-photo']
    },
    {
        tag: '标注',
        title: '说明与装饰',
        description: '文字、水印、形状和贴纸统一收纳，减少素材类入口的重复感。',
        tools: ['text', 'shape', 'image-watermark', 'sticker']
    },
    {
        tag: '智能',
        title: '识别与生成',
        description: 'AI 与识别能力集中展示，和普通修图入口彻底分开。',
        tools: ['ocr', 'ai-gen', 'icon-gen']
    },
    {
        tag: '输出',
        title: '切图与批量',
        description: '把切图、重命名、批量处理与拼图统一放到最终输出区。',
        tools: ['grid-slice', 'long-slice', 'doc-export', 'batch-processor', 'batch', 'collage']
    }
];

const sidebarToolMeta = {
    crop: { icon: '✂', title: '裁剪', desc: '自由裁切与常用比例' },
    resize: { icon: '↔', title: '尺寸', desc: '调整宽高与缩放' },
    compress: { icon: '⤓', title: '压缩', desc: '减小体积并控制质量' },
    rotate: { icon: '⟳', title: '旋转', desc: '快速修正方向' },
    filter: { icon: '◐', title: '滤镜', desc: '预设风格与手动调节' },
    frame: { icon: '▣', title: '图框阴影', desc: '边框、留白与氛围感' },
    mosaic: { icon: '▒', title: '马赛克', desc: '遮挡敏感信息' },
    'remove-watermark': { icon: '⌦', title: '裁边去印', desc: '边缘水印快速处理' },
    'magic-eraser': { icon: '✦', title: '涂抹消除', desc: '局部擦除与智能修复' },
    'ai-background': { icon: '☁', title: '背景替换', desc: '抠图后更换场景' },
    'id-photo': { icon: '◎', title: '证件照', desc: '规范尺寸与底色' },
    text: { icon: '文', title: '添加文本', desc: '标题、水印与说明' },
    shape: { icon: '△', title: '标注形状', desc: '箭头、框选和强调' },
    'image-watermark': { icon: '◫', title: '图片水印', desc: '标识与品牌露出' },
    sticker: { icon: '★', title: '添加贴纸', desc: '表情和装饰元素' },
    ocr: { icon: '文', title: '文字识别', desc: '提取画面中的文字' },
    'ai-gen': { icon: '绘', title: '智能生图', desc: '生成与编辑图像' },
    'icon-gen': { icon: '◈', title: '插件图标', desc: '生成扩展图标素材' },
    'grid-slice': { icon: '#', title: '网格切图', desc: '九宫格与矩阵切片' },
    'long-slice': { icon: '↕', title: '长图切片', desc: '连续拆分长图' },
    'doc-export': { icon: '册', title: '文档导出', desc: '导出 PDF、Word、PPT' },
    'batch-processor': { icon: '⚡', title: '批量处理', desc: '多图统一压缩与转换' },
    batch: { icon: '名', title: '批量重命名', desc: '统一文件命名规则' },
    collage: { icon: '▥', title: '拼图', desc: '模板化组合多张图片' }
};

function rebuildSidebarNavigation() {
    const toolList = document.querySelector('.tool-list');
    if (!toolList) return;

    const buttonMap = new Map(
        Array.from(toolList.querySelectorAll('.tool-btn')).map(button => [button.dataset.tool, button])
    );

    toolList.innerHTML = '';

    sidebarSections.forEach((section) => {
        const group = document.createElement('section');
        group.className = 'tool-group';

        const header = document.createElement('div');
        header.className = 'tool-group-head';
        header.innerHTML = `
            <span class="tool-group-tag">${section.tag}</span>
            <h3>${section.title}</h3>
            <p>${section.description}</p>
        `;

        const body = document.createElement('div');
        body.className = 'tool-group-body';

        section.tools.forEach((toolId) => {
            const button = buttonMap.get(toolId);
            const meta = sidebarToolMeta[toolId];
            if (!button || !meta) return;

            button.innerHTML = `
                <span class="tool-btn-icon">${meta.icon}</span>
                <span class="tool-btn-copy">
                    <strong>${meta.title}</strong>
                    <small>${meta.desc}</small>
                </span>
            `;

            body.appendChild(button);
        });

        group.appendChild(header);
        group.appendChild(body);
        toolList.appendChild(group);
    });

    const propertyPanel = document.getElementById('property-panel');
    const panelContent = document.getElementById('panel-content');
    if (propertyPanel && panelContent && !propertyPanel.querySelector('.panel-shell-head')) {
        const shellHead = document.createElement('div');
        shellHead.className = 'panel-shell-head';
        shellHead.innerHTML = `
            <span class="panel-shell-tag">Inspector</span>
            <h3>调整面板</h3>
            <p>选中工具后，在这里完成参数设置与应用。</p>
        `;
        propertyPanel.insertBefore(shellHead, panelContent);
    }

    const authorCredit = document.getElementById('author-credit');
    if (authorCredit) {
        authorCredit.textContent = 'jiaoge';
    }
}

function calculateCanvasView(width, height) {
    const maxWidth = Math.max(dropZone.offsetWidth - CANVAS_VIEW_MARGIN, 1);
    const maxHeight = Math.max(dropZone.offsetHeight - CANVAS_VIEW_MARGIN, 1);
    const scale = Math.min(1, maxWidth / width, maxHeight / height);

    return {
        scale,
        displayWidth: Math.max(1, Math.round(width * scale)),
        displayHeight: Math.max(1, Math.round(height * scale))
    };
}

function updateZoomIndicator(scale = 1) {
    if (zoomLevel) {
        zoomLevel.textContent = `${Math.round(scale * 100)}%`;
    }
}

function syncCanvasDisplay(canvasInstance = window.canvas) {
    if (!canvasInstance || !canvasInstance._originalSetDimensions) return;

    const width = canvasInstance.width || 0;
    const height = canvasInstance.height || 0;

    if (width <= 0 || height <= 0) {
        canvasInstance._originalSetDimensions({ width: 0, height: 0 }, { cssOnly: true });
        canvasInstance.calcOffset();
        canvasWrapper.style.width = '0px';
        canvasWrapper.style.height = '0px';
        updateZoomIndicator(1);
        return;
    }

    const { scale, displayWidth, displayHeight } = calculateCanvasView(width, height);
    canvasInstance._originalSetDimensions({ width: displayWidth, height: displayHeight }, { cssOnly: true });
    canvasInstance.calcOffset();

    canvasWrapper.style.width = `${displayWidth}px`;
    canvasWrapper.style.height = `${displayHeight}px`;
    updateZoomIndicator(scale);
}

function installCanvasDisplaySync(canvasInstance) {
    if (!canvasInstance || canvasInstance._displaySyncInstalled) return;

    const originalSetDimensions = canvasInstance.setDimensions.bind(canvasInstance);
    canvasInstance._originalSetDimensions = originalSetDimensions;

    canvasInstance.setDimensions = (dimensions, options) => {
        const result = originalSetDimensions(dimensions, options);
        if (!options || !options.cssOnly) {
            syncCanvasDisplay(canvasInstance);
        }
        return result;
    };

    canvasInstance._displaySyncInstalled = true;
    syncCanvasDisplay(canvasInstance);
}

window.syncCanvasDisplay = syncCanvasDisplay;
window.installCanvasDisplaySync = installCanvasDisplaySync;
rebuildSidebarNavigation();

// Initialize Fabric Canvas
function initCanvas() {
    window.canvas = new fabric.Canvas('main-canvas', {
        backgroundColor: '#1a1a1a',
        preserveObjectStacking: true,
        stopContextMenu: true
    });
    canvas = window.canvas; // 保持局部引用兼容
    installCanvasDisplaySync(window.canvas);

    // Resize canvas to fit container initially
    resizeCanvasToFit();

    // Listen for object modifications for history
    canvas.on('object:modified', () => historyManager.push(canvas));
    canvas.on('object:added', (e) => {
        if (!e.target.isInternal) historyManager.push(canvas);
    });

    // Listen for object selection to update property panel
    const continuousTools = ['shape', 'text', 'sticker', 'image-watermark', 'doc-export'];

    canvas.on('selection:created', () => {
        if (toolManager._stickerMode) return;  // 贴纸模式下不切换面板
        if (continuousTools.includes(toolManager.currentTool)) return; // 连续操作模式下不切换面板
        toolManager.updatePropertyPanel('select');
    });

    canvas.on('selection:updated', () => {
        if (toolManager._stickerMode) return;  // 贴纸模式下不切换面板
        if (continuousTools.includes(toolManager.currentTool)) return; // 连续操作模式下不切换面板
        toolManager.updatePropertyPanel('select');
    });

    canvas.on('selection:cleared', () => {
        if (toolManager._stickerMode) return;  // 贴纸模式下不切换面板
        if (continuousTools.includes(toolManager.currentTool)) return; // 连续操作模式下不切换面板
        toolManager.updatePropertyPanel('select');
    });
}

function resizeCanvasToFit() {
    syncCanvasDisplay();
}

// Image Loading Logic
function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageUrl = e.target.result;
        loadContent(imageUrl);
    };
    reader.readAsDataURL(file);
}

function loadContent(url) {
    fabric.Image.fromURL(url, (img) => {
        if (!canvas) initCanvas();

        // Clear existing objects
        canvas.clear();
        if (typeof toolManager !== 'undefined') {
            toolManager.aiBgState = null;
            toolManager.idPhotoState = null;
        }

        canvas.setDimensions({ width: img.width, height: img.height });
        img.set({
            left: 0,
            top: 0,
            scaleX: 1,
            scaleY: 1
        });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();

        // UI transitions
        welcomeScreen.style.display = 'none';
        canvasWrapper.style.display = 'block';
        if (btnReset) btnReset.style.display = 'block';
        if (btnCopy) btnCopy.style.display = 'block';
        if (btnDownload) btnDownload.style.display = 'block';
        if (exportControls) exportControls.style.display = 'flex';

        // Initialize history with first state
        historyManager.clear();
        historyManager.push(canvas);
    });
}

/**
 * Reset editor to initial state
 */
function resetEditor() {
    if (!canvas) return;

    if (confirm('确定要删除当前图片并重新开始吗？未保存的更改将丢失。')) {
        // Clear canvas
        canvas.clear();
        canvas.setDimensions({ width: 0, height: 0 });

        // Reset UI
        welcomeScreen.style.display = 'flex';
        canvasWrapper.style.display = 'none';
        if (btnReset) btnReset.style.display = 'none';
        if (btnCopy) btnCopy.style.display = 'none';
        if (btnDownload) btnDownload.style.display = 'none';
        if (exportControls) exportControls.style.display = 'none';

        // Reset history and tools
        historyManager.clear();
        toolManager.activate('select');

        // Reset file input so same file can be selected again
        fileInput.value = '';
    }
}

// Event Listeners
document.querySelector('.upload-btn').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));
if (btnReset) btnReset.addEventListener('click', resetEditor);

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    handleImageFile(e.dataTransfer.files[0]);
});

// Paste (Ctrl+V)
window.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            handleImageFile(blob);
        }
    }
});

// Tool Selection
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        console.log('工具按钮被点击:', btn.dataset.tool);
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        console.log('激活工具:', tool);
        toolManager.activate(tool);
    });
});

// Export Logic and Format Control
if (formatSelect) {
    formatSelect.addEventListener('change', () => {
        const isLossless = formatSelect.value === 'png';
        if (qualityWrapper) {
            qualityWrapper.style.display = isLossless ? 'none' : 'flex';
        }
    });
}

if (qualityInput) {
    qualityInput.addEventListener('input', () => {
        if (qualityValue) {
            qualityValue.textContent = qualityInput.value;
        }
    });
}

document.getElementById('btn-download').addEventListener('click', () => {
    const format = formatSelect ? formatSelect.value : 'png';
    const quality = qualityInput ? parseFloat(qualityInput.value) : 0.9;
    const fabricFormat = format === 'jpeg' ? 'jpeg' : format;
    const dataURL = canvas.toDataURL({
        format: fabricFormat,
        quality: quality
    });

    const extension = format === 'jpeg' ? 'jpg' : format;
    const link = document.createElement('a');
    link.download = `edited-image.${extension}`;
    link.href = dataURL;
    link.click();
});

document.getElementById('btn-copy').addEventListener('click', async () => {
    const dataURL = canvas.toDataURL();
    try {
        const response = await fetch(dataURL);
        const blob = await response.blob();
        await navigator.clipboard.write([
            new ClipboardItem({
                [blob.type]: blob
            })
        ]);
        alert('图片已复制到剪贴板！');
    } catch (err) {
        console.error('复制失败', err);
    }
});

// QR Code Modal Handlers
const authorCredit = document.getElementById('author-credit');
const qrModal = document.getElementById('qr-modal');
const qrClose = document.querySelector('.qr-close');

if (authorCredit) {
    authorCredit.addEventListener('click', () => {
        qrModal.style.display = 'flex';
    });
}

if (qrClose) {
    qrClose.addEventListener('click', () => {
        qrModal.style.display = 'none';
    });
}

// Close modal when clicking outside
if (qrModal) {
    qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) {
            qrModal.style.display = 'none';
        }
    });
}

window.addEventListener('resize', () => {
    syncCanvasDisplay();
});

// ==================== Sidebar Resizer Logic ====================
const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('resizer');
let isResizing = false;
let lastDownX = 0;

if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        lastDownX = e.clientX;
        resizer.classList.add('resizing');

        // 防止拖拽时选中文本
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';
    });
}

document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const offsetX = e.clientX - lastDownX;
    const newWidth = sidebar.offsetWidth + offsetX;

    // 限制最小和最大宽度
    const minWidth = 180;
    const maxWidth = 500;

    if (newWidth >= minWidth && newWidth <= maxWidth) {
        sidebar.style.width = newWidth + 'px';
        lastDownX = e.clientX;
        syncCanvasDisplay();
    }
});

document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        if (resizer) {
            resizer.classList.remove('resizing');
        }
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
    }
});
