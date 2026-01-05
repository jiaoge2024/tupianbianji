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

// Initialize Fabric Canvas
function initCanvas() {
    window.canvas = new fabric.Canvas('main-canvas', {
        backgroundColor: '#1a1a1a',
        preserveObjectStacking: true,
        stopContextMenu: true
    });
    canvas = window.canvas; // 保持局部引用兼容

    if (fabric?.Text?.prototype) fabric.Text.prototype.textBaseline = 'alphabetic';
    if (fabric?.IText?.prototype) fabric.IText.prototype.textBaseline = 'alphabetic';
    if (fabric?.Textbox?.prototype) fabric.Textbox.prototype.textBaseline = 'alphabetic';

    // Resize canvas to fit container initially
    resizeCanvasToFit();

    // Listen for object modifications for history
    canvas.on('object:modified', () => historyManager.push(canvas));
    canvas.on('object:added', (e) => {
        if (!e.target.isInternal) historyManager.push(canvas);
    });

    // Listen for object selection to update property panel
    canvas.on('selection:created', () => {
        toolManager.updatePropertyPanel('select');
    });

    canvas.on('selection:updated', () => {
        toolManager.updatePropertyPanel('select');
    });

    canvas.on('selection:cleared', () => {
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
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tool = btn.dataset.tool;
        toolManager.activate(tool);
    });
});

// Export Logic
document.getElementById('btn-download').addEventListener('click', () => {
    const dataURL = canvas.toDataURL({
        format: 'png',
        quality: 1
    });
    const link = document.createElement('a');
    link.download = 'edited-image.png';
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
