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

// Initialize Fabric Canvas
function initCanvas() {
    window.canvas = new fabric.Canvas('main-canvas', {
        backgroundColor: '#1a1a1a',
        preserveObjectStacking: true,
        stopContextMenu: true
    });
    canvas = window.canvas; // 保持局部引用兼容

    // Resize canvas to fit container initially
    resizeCanvasToFit();

    // Listen for object modifications for history
    canvas.on('object:modified', () => historyManager.push(canvas));
    canvas.on('object:added', (e) => {
        if (!e.target.isInternal) historyManager.push(canvas);
    });

    // Listen for object selection to update property panel
    const continuousTools = ['shape', 'text', 'sticker', 'image-watermark'];

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
    const margin = 80;
    const parentWidth = dropZone.offsetWidth - margin;
    const parentHeight = dropZone.offsetHeight - margin;

    // This doesn't resize the image, just the viewable area
    // Actual image handling happens in loadContent
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

        // Scale to fit screen
        const maxWidth = dropZone.offsetWidth - 100;
        const maxHeight = dropZone.offsetHeight - 100;

        let scale = 1;
        if (img.width > maxWidth || img.height > maxHeight) {
            scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        }

        canvas.setDimensions({ width: img.width * scale, height: img.height * scale });
        img.scale(scale);

        canvas.add(img);
        canvas.centerObject(img);
        canvas.setActiveObject(img);

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

    // fabric.js handles 'jpeg' as 'jpeg' but for input selector we might want to be consistent
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

