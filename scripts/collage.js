/**
 * 拼图功能模块
 * 支持多种模板、拖拽排序、图片上传和保存
 */

// 全局变量
let collageImages = [];
let collageManager = null;
let selectedTemplate = null;
let collageCanvas = null;
let draggedIndex = null;

// 拼图模板配置（参照美图秀秀风格，使用gridArea简化定义）
// gridArea格式: "rowStart/rowEnd/colStart/colEnd" (使用1-based索引)
const collageTemplates = [
    // === 2图 ===
    { id: '2-h', name: '2', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' }
    ], cols: 2, rows: 1, desc: '横向双图' },
    { id: '2-v', name: '2', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '2/3/1/2' }
    ], cols: 1, rows: 2, desc: '纵向双图' },
    
    // === 3图 ===
    { id: '3-h', name: '3', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' }, { gridArea: '1/2/3/4' }
    ], cols: 3, rows: 1, desc: '横向三图' },
    { id: '3-v', name: '3', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '2/3/1/2' }, { gridArea: '3/4/1/2' }
    ], cols: 1, rows: 3, desc: '纵向三图' },
    { id: '3-1+2', name: '3', cells: [
        { gridArea: '1/3/1/2' }, { gridArea: '1/2/2/3' }, { gridArea: '2/3/2/3' }
    ], cols: 2, rows: 2, desc: '左大右双' },
    { id: '3-2+1', name: '3', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' }, { gridArea: '2/3/1/3' }
    ], cols: 2, rows: 2, desc: '上双下大' },
    
    // === 4图 ===
    { id: '4-2x2', name: '4', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' }
    ], cols: 2, rows: 2, desc: '田字四图' },
    { id: '4-1+3v', name: '4', cells: [
        { gridArea: '1/4/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/2/3' }, { gridArea: '3/4/2/3' }
    ], cols: 2, rows: 3, desc: '左大右三竖' },
    { id: '4-3+1v', name: '4', cells: [
        { gridArea: '1/2/2/3' }, { gridArea: '2/3/2/3' },
        { gridArea: '3/4/2/3' }, { gridArea: '1/4/1/2' }
    ], cols: 2, rows: 3, desc: '右大左三竖' },
    { id: '4-1+3h', name: '4', cells: [
        { gridArea: '1/2/1/4' }, { gridArea: '2/3/1/2' },
        { gridArea: '2/3/2/3' }, { gridArea: '2/3/3/4' }
    ], cols: 3, rows: 2, desc: '上大四横' },
    { id: '4-3+1h', name: '4', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '1/2/3/4' }, { gridArea: '2/3/1/4' }
    ], cols: 3, rows: 2, desc: '下大四横' },
    { id: '4-4h', name: '4', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '1/2/3/4' }, { gridArea: '1/2/4/5' }
    ], cols: 4, rows: 1, desc: '横向四图' },
    { id: '4-4v', name: '4', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '2/3/1/2' },
        { gridArea: '3/4/1/2' }, { gridArea: '4/5/1/2' }
    ], cols: 1, rows: 4, desc: '纵向四图' },
    { id: '4-1+2+1', name: '4', cells: [
        { gridArea: '1/2/1/3' }, { gridArea: '2/3/1/2' },
        { gridArea: '2/3/2/3' }, { gridArea: '3/4/1/3' }
    ], cols: 2, rows: 3, desc: '上下大中间双' },
    
    // === 5图 ===
    { id: '5-1+4', name: '5', cells: [
        { gridArea: '1/3/1/3' }, { gridArea: '1/2/3/4' },
        { gridArea: '1/2/4/5' }, { gridArea: '2/3/3/4' },
        { gridArea: '2/3/4/5' }
    ], cols: 4, rows: 2, desc: '左大右田字' },
    { id: '5-4+1', name: '5', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' },
        { gridArea: '1/3/3/5' }
    ], cols: 4, rows: 2, desc: '右大左田字' },
    { id: '5-1+4v', name: '5', cells: [
        { gridArea: '1/5/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/2/3' }, { gridArea: '3/4/2/3' },
        { gridArea: '4/5/2/3' }
    ], cols: 2, rows: 4, desc: '左大右四竖' },
    { id: '5-4+1v', name: '5', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '2/3/1/2' },
        { gridArea: '3/4/1/2' }, { gridArea: '4/5/1/2' },
        { gridArea: '1/5/2/3' }
    ], cols: 2, rows: 4, desc: '右大左四竖' },
    { id: '5-cross', name: '5', cells: [
        { gridArea: '1/2/2/3' }, { gridArea: '2/3/1/2' },
        { gridArea: '2/3/2/3' }, { gridArea: '2/3/3/4' },
        { gridArea: '3/4/2/3' }
    ], cols: 3, rows: 3, desc: '十字形' },
    
    // === 6图 ===
    { id: '6-2x3', name: '6', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' },
        { gridArea: '3/4/1/2' }, { gridArea: '3/4/2/3' }
    ], cols: 2, rows: 3, desc: '2x3网格' },
    { id: '6-3x2', name: '6', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' }, { gridArea: '1/2/3/4' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' }, { gridArea: '2/3/3/4' }
    ], cols: 3, rows: 2, desc: '3x2网格' },
    { id: '6-1+5v', name: '6', cells: [
        { gridArea: '1/6/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/2/3' }, { gridArea: '3/4/2/3' },
        { gridArea: '4/5/2/3' }, { gridArea: '5/6/2/3' }
    ], cols: 2, rows: 5, desc: '左大右五竖' },
    
    // === 7图 ===
    { id: '7-1+6', name: '7', cells: [
        { gridArea: '1/4/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '1/2/3/4' }, { gridArea: '2/3/2/3' },
        { gridArea: '2/3/3/4' }, { gridArea: '3/4/2/3' },
        { gridArea: '3/4/3/4' }
    ], cols: 3, rows: 3, desc: '左大右六宫' },
    { id: '7-6+1', name: '7', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' },
        { gridArea: '3/4/1/2' }, { gridArea: '3/4/2/3' },
        { gridArea: '1/4/3/4' }
    ], cols: 3, rows: 3, desc: '右大左六宫' },
    
    // === 8图 ===
    { id: '8-2x4', name: '8', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' },
        { gridArea: '3/4/1/2' }, { gridArea: '3/4/2/3' },
        { gridArea: '4/5/1/2' }, { gridArea: '4/5/2/3' }
    ], cols: 2, rows: 4, desc: '2x4网格' },
    { id: '8-4x2', name: '8', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' },
        { gridArea: '1/2/3/4' }, { gridArea: '1/2/4/5' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' },
        { gridArea: '2/3/3/4' }, { gridArea: '2/3/4/5' }
    ], cols: 4, rows: 2, desc: '4x2网格' },
    
    // === 9图 ===
    { id: '9-3x3', name: '9', cells: [
        { gridArea: '1/2/1/2' }, { gridArea: '1/2/2/3' }, { gridArea: '1/2/3/4' },
        { gridArea: '2/3/1/2' }, { gridArea: '2/3/2/3' }, { gridArea: '2/3/3/4' },
        { gridArea: '3/4/1/2' }, { gridArea: '3/4/2/3' }, { gridArea: '3/4/3/4' }
    ], cols: 3, rows: 3, desc: '九宫格' }
];

/**
 * 打开拼图模态框
 */
function openCollage() {
    console.log('[Collage] 打开拼图模态框');

    const modal = document.getElementById('collage-modal');
    if (!modal) {
        console.error('[Collage] 找不到 collage-modal 元素');
        alert('拼图功能加载失败');
        return;
    }

    // 重置所有状态（每次打开都是初始状态）
    resetCollageState();

    // 显示模态框
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 初始化事件
    if (!collageManager) {
        initCollageEvents();
    }

    // 初始化模板
    renderCollageTemplates();

    // 选择默认模板
    selectedTemplate = null;
    selectCollageTemplate(collageTemplates[3]); // 默认选择 2x2

    console.log('[Collage] 模态框已显示');
}

/**
 * 重置拼图状态
 */
function resetCollageState() {
    // 释放所有图片URL
    collageImages.forEach(img => {
        if (img && img.src) {
            URL.revokeObjectURL(img.src);
        }
    });
    
    // 清空数组
    collageImages = [];
    
    // 重置选中交换状态
    selectedSwapIndex = null;
    hideSwapHint();
    
    // 清空文件输入
    if (collageManager && collageManager.fileInput) {
        collageManager.fileInput.value = '';
    }
}

/**
 * 关闭拼图模态框
 */
function closeCollage() {
    const modal = document.getElementById('collage-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * 初始化拼图事件
 */
function initCollageEvents() {
    console.log('[Collage] 初始化事件');

    collageManager = {
        modal: document.getElementById('collage-modal'),
        closeBtn: document.getElementById('collage-close'),
        uploadArea: document.getElementById('collage-upload-area'),
        fileInput: document.getElementById('collage-file-input'),
        imageList: document.getElementById('collage-image-list'),
        countDisplay: document.getElementById('collage-count'),
        canvasContainer: document.getElementById('collage-canvas-container'),
        canvas: document.getElementById('collage-canvas'),
        clearBtn: document.getElementById('collage-clear'),
        downloadBtn: document.getElementById('collage-download'),
        emptyHint: document.getElementById('collage-empty-hint')
    };

    const m = collageManager;

    // 关闭按钮
    if (m.closeBtn) {
        m.closeBtn.addEventListener('click', closeCollage);
    }

    // 点击模态框外部关闭
    if (m.modal) {
        m.modal.addEventListener('click', (e) => {
            if (e.target === m.modal) closeCollage();
        });
    }

    // 上传区域点击
    if (m.uploadArea && m.fileInput) {
        m.uploadArea.addEventListener('click', () => m.fileInput.click());
    }

    // 文件选择
    if (m.fileInput) {
        m.fileInput.addEventListener('change', (e) => handleCollageFiles(e.target.files));
    }

    // 拖拽上传到画布容器
    if (m.canvasContainer) {
        m.canvasContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            m.canvasContainer.classList.add('dragover');
        });

        m.canvasContainer.addEventListener('dragleave', () => {
            m.canvasContainer.classList.remove('dragover');
        });

        m.canvasContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            m.canvasContainer.classList.remove('dragover');
            handleCollageFiles(e.dataTransfer.files);
        });
    }

    // 清空按钮
    if (m.clearBtn) {
        m.clearBtn.addEventListener('click', clearCollageImages);
    }

    // 下载按钮
    if (m.downloadBtn) {
        m.downloadBtn.addEventListener('click', downloadCollage);
    }

    console.log('[Collage] 事件初始化完成');
}

/**
 * 解析 gridArea 为行列信息
 * gridArea格式: "rowStart/rowEnd/colStart/colEnd"
 */
function parseGridArea(gridArea) {
    const parts = gridArea.split('/').map(p => parseInt(p.trim()));
    return {
        rowStart: parts[0],
        rowEnd: parts[1],
        colStart: parts[2],
        colEnd: parts[3]
    };
}

/**
 * 渲染模板选择区
 */
function renderCollageTemplates() {
    const grid = document.getElementById('collage-template-grid');
    if (!grid) return;

    grid.innerHTML = '';

    collageTemplates.forEach(template => {
        const item = document.createElement('div');
        item.className = 'collage-template-item';
        item.dataset.templateId = template.id;
        item.title = template.desc || `${template.cells.length}张图`;

        // 生成模板预览
        const preview = document.createElement('div');
        preview.className = 'collage-template-preview';
        preview.style.cssText = `
            display: grid;
            grid-template-columns: repeat(${template.cols}, 1fr);
            grid-template-rows: repeat(${template.rows}, 1fr);
            gap: 2px;
            width: 100%;
            height: 100%;
        `;

        // 创建图片格子
        template.cells.forEach((cell, idx) => {
            const area = parseGridArea(cell.gridArea);
            const cellDiv = document.createElement('div');
            cellDiv.style.cssText = `
                background: #3a3a3a;
                border-radius: 2px;
                grid-row: ${area.rowStart} / ${area.rowEnd};
                grid-column: ${area.colStart} / ${area.colEnd};
            `;
            preview.appendChild(cellDiv);
        });

        const label = document.createElement('span');
        label.className = 'collage-template-name';
        label.textContent = `${template.cells.length}`;

        item.appendChild(preview);
        item.appendChild(label);

        item.addEventListener('click', () => selectCollageTemplate(template));

        grid.appendChild(item);
    });
}

/**
 * 选择模板
 */
function selectCollageTemplate(template) {
    selectedTemplate = template;

    // 更新选中状态
    const items = document.querySelectorAll('.collage-template-item');
    items.forEach(item => {
        if (item.dataset.templateId === template.id) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    // 重新渲染画布
    renderCollageCanvas();
}

/**
 * 处理上传的文件
 */
function handleCollageFiles(files) {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
        alert('请选择图片文件');
        return;
    }

    // 检查数量限制
    const availableSlots = selectedTemplate ? selectedTemplate.cells.length : 9;
    const remainingSlots = availableSlots - collageImages.length;

    if (remainingSlots <= 0) {
        alert(`当前模板最多只能放置 ${availableSlots} 张图片`);
        return;
    }

    // 添加图片
    const filesToAdd = imageFiles.slice(0, remainingSlots);
    filesToAdd.forEach(file => {
        collageImages.push({
            file: file,
            src: URL.createObjectURL(file),
            name: file.name
        });
    });

    updateCollageUI();
    renderCollageCanvas();
}

/**
 * 更新界面显示
 */
function updateCollageUI() {
    const m = collageManager;
    if (!m) return;

    // 更新计数
    if (m.countDisplay) {
        m.countDisplay.textContent = collageImages.length;
    }

    // 显示/隐藏空提示
    if (m.emptyHint) {
        m.emptyHint.style.display = collageImages.length === 0 ? 'flex' : 'none';
    }

    // 渲染图片列表
    renderCollageImageList();

    // 更新按钮状态
    if (m.downloadBtn) m.downloadBtn.disabled = collageImages.length === 0;
    if (m.clearBtn) m.clearBtn.disabled = collageImages.length === 0;
}

let selectedSwapIndex = null;

/**
 * 渲染图片列表
 */
function renderCollageImageList() {
    const m = collageManager;
    if (!m || !m.imageList) return;

    m.imageList.innerHTML = '';

    // 检查并修正 selectedSwapIndex，避免拖拽后索引失效
    if (selectedSwapIndex !== null && selectedSwapIndex >= collageImages.length) {
        selectedSwapIndex = null;
        hideSwapHint();
    }

    collageImages.forEach((img, index) => {
        // 安全检查
        if (!img || !img.src) return;

        const item = document.createElement('div');
        item.className = 'collage-image-item';
        if (selectedSwapIndex === index) {
            item.classList.add('selected-swap');
        }
        item.draggable = true;
        item.dataset.index = index;
        item.title = '拖拽调整顺序，点击查看大图，点击两次交换位置';

        item.innerHTML = `
            <img src="${img.src}" alt="${img.name || 'image'}">
            <button class="collage-image-remove" data-index="${index}" title="移除">×</button>
            <div class="collage-image-number">${index + 1}</div>
            <div class="collage-swap-hint">点击交换</div>
        `;

        // 移除按钮
        const removeBtn = item.querySelector('.collage-image-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeCollageImage(index);
        });

        // 点击交换功能
        item.addEventListener('click', (e) => {
            // 如果点击的是移除按钮，不处理
            if (e.target.closest('.collage-image-remove')) return;
            handleImageSwap(index);
        });

        // 拖拽事件
        item.addEventListener('dragstart', handleImageDragStart);
        item.addEventListener('dragover', handleImageDragOver);
        item.addEventListener('drop', handleImageDrop);
        item.addEventListener('dragend', handleImageDragEnd);

        m.imageList.appendChild(item);
    });
}

/**
 * 处理图片交换
 */
function handleImageSwap(index) {
    if (selectedSwapIndex === null) {
        // 第一次点击，选中该图片
        selectedSwapIndex = index;
        renderCollageImageList();
        showSwapHint(`已选中第 ${index + 1} 张，请点击另一张图片进行交换`);
    } else if (selectedSwapIndex === index) {
        // 点击同一张，取消选择
        selectedSwapIndex = null;
        renderCollageImageList();
        hideSwapHint();
    } else {
        // 交换两张图片
        const temp = collageImages[selectedSwapIndex];
        collageImages[selectedSwapIndex] = collageImages[index];
        collageImages[index] = temp;
        
        selectedSwapIndex = null;
        renderCollageImageList();
        renderCollageCanvas();
        hideSwapHint();
        showSwapHint('交换成功！', 1500);
    }
}

/**
 * 显示交换提示
 */
function showSwapHint(message, duration = 0) {
    let hint = document.getElementById('collage-swap-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'collage-swap-hint';
        hint.className = 'collage-swap-notification';
        document.querySelector('.collage-images')?.appendChild(hint);
    }
    hint.textContent = message;
    hint.style.display = 'block';
    
    if (duration > 0) {
        setTimeout(() => {
            hint.style.display = 'none';
        }, duration);
    }
}

/**
 * 隐藏交换提示
 */
function hideSwapHint() {
    const hint = document.getElementById('collage-swap-hint');
    if (hint) {
        hint.style.display = 'none';
    }
}

/**
 * 拖拽排序处理
 */
function handleImageDragStart(e) {
    draggedIndex = parseInt(e.target.dataset.index);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleImageDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleImageDrop(e) {
    e.preventDefault();
    const targetItem = e.target.closest('.collage-image-item');
    if (!targetItem) return;
    
    const targetIndex = parseInt(targetItem.dataset.index);
    if (isNaN(targetIndex)) return;

    if (draggedIndex !== null && draggedIndex !== targetIndex) {
        // 交换位置
        const temp = collageImages[draggedIndex];
        collageImages.splice(draggedIndex, 1);
        collageImages.splice(targetIndex, 0, temp);

        // 重置点击交换状态，因为索引已经改变
        if (selectedSwapIndex !== null) {
            selectedSwapIndex = null;
            hideSwapHint();
        }

        updateCollageUI();
        renderCollageCanvas();
    }
}

function handleImageDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedIndex = null;
}

/**
 * 移除图片
 */
function removeCollageImage(index) {
    if (collageImages[index]) {
        URL.revokeObjectURL(collageImages[index].src);
        collageImages.splice(index, 1);
    }
    
    // 如果被删除的是选中的交换图片，或删除后索引变化，重置状态
    if (selectedSwapIndex !== null) {
        if (selectedSwapIndex === index) {
            // 删除的是选中的那张
            selectedSwapIndex = null;
            hideSwapHint();
        } else if (selectedSwapIndex > index) {
            // 删除的是前面的图片，调整选中索引
            selectedSwapIndex--;
        }
    }
    
    updateCollageUI();
    renderCollageCanvas();
}

/**
 * 清空所有图片
 */
function clearCollageImages() {
    // 释放所有图片URL
    collageImages.forEach(img => {
        if (img && img.src) {
            URL.revokeObjectURL(img.src);
        }
    });
    
    // 清空数组
    collageImages = [];
    
    // 重置选中交换状态
    selectedSwapIndex = null;
    hideSwapHint();
    
    // 清空文件输入
    if (collageManager && collageManager.fileInput) {
        collageManager.fileInput.value = '';
    }
    
    // 更新UI和画布
    updateCollageUI();
    renderCollageCanvas();
}

/**
 * 渲染拼图画布
 */
function renderCollageCanvas() {
    const m = collageManager;
    if (!m || !m.canvas || !selectedTemplate) return;

    const canvas = m.canvas;
    const ctx = canvas.getContext('2d');

    // 画布尺寸
    const canvasWidth = 600;
    const canvasHeight = 600;
    const padding = 10;
    const gap = 4;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 清空画布
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const cols = selectedTemplate.cols;
    const rows = selectedTemplate.rows;

    const cellWidth = (canvasWidth - padding * 2 - gap * (cols - 1)) / cols;
    const cellHeight = (canvasHeight - padding * 2 - gap * (rows - 1)) / rows;

    // 加载所有图片
    const loadPromises = selectedTemplate.cells.map((cell, index) => {
        return new Promise((resolve) => {
            if (index < collageImages.length && collageImages[index] && collageImages[index].src) {
                const img = new Image();
                img.onload = () => resolve({ img, cell, index });
                img.onerror = () => resolve(null);
                img.src = collageImages[index].src;
            } else {
                resolve(null);
            }
        });
    });

    Promise.all(loadPromises).then(results => {
        results.forEach((result, idx) => {
            const cell = selectedTemplate.cells[idx];
            const area = parseGridArea(cell.gridArea);
            
            // 计算实际像素位置和尺寸
            const rowStart = area.rowStart - 1;
            const rowEnd = area.rowEnd - 1;
            const colStart = area.colStart - 1;
            const colEnd = area.colEnd - 1;
            
            const x = padding + colStart * (cellWidth + gap);
            const y = padding + rowStart * (cellHeight + gap);
            const w = cellWidth * (colEnd - colStart) + gap * (colEnd - colStart - 1);
            const h = cellHeight * (rowEnd - rowStart) + gap * (rowEnd - rowStart - 1);
            
            if (result) {
                const { img } = result;
                // 绘制图片（居中裁剪）
                drawImageCover(ctx, img, x, y, w, h);
            } else {
                // 绘制空白格子
                ctx.fillStyle = '#2a2a2a';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = '#444';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, w, h);
            }
        });
    });
}

/**
 * 绘制图片（覆盖模式，居中裁剪）
 */
function drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const targetRatio = w / h;

    let sx, sy, sw, sh;

    if (imgRatio > targetRatio) {
        // 图片更宽
        sh = img.height;
        sw = sh * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        // 图片更高
        sw = img.width;
        sh = sw / targetRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * 下载拼图
 */
function downloadCollage() {
    if (collageImages.length === 0) {
        alert('请先添加图片');
        return;
    }

    const m = collageManager;
    if (!m || !m.canvas) return;

    // 创建高分辨率画布
    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');

    const exportWidth = 1200;
    const exportHeight = 1200;
    const padding = 20;
    const gap = 8;

    exportCanvas.width = exportWidth;
    exportCanvas.height = exportHeight;

    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    const cols = selectedTemplate.cols;
    const rows = selectedTemplate.rows;

    const cellWidth = (exportWidth - padding * 2 - gap * (cols - 1)) / cols;
    const cellHeight = (exportHeight - padding * 2 - gap * (rows - 1)) / rows;

    // 加载所有图片并绘制
    const loadPromises = selectedTemplate.cells.map((cell, index) => {
        return new Promise((resolve) => {
            if (index < collageImages.length && collageImages[index] && collageImages[index].src) {
                const img = new Image();
                img.onload = () => resolve({ img, cell, index });
                img.onerror = () => resolve(null);
                img.src = collageImages[index].src;
            } else {
                resolve(null);
            }
        });
    });

    Promise.all(loadPromises).then(results => {
        results.forEach((result, idx) => {
            const cell = selectedTemplate.cells[idx];
            const area = parseGridArea(cell.gridArea);
            
            // 计算实际像素位置和尺寸
            const rowStart = area.rowStart - 1;
            const rowEnd = area.rowEnd - 1;
            const colStart = area.colStart - 1;
            const colEnd = area.colEnd - 1;
            
            const x = padding + colStart * (cellWidth + gap);
            const y = padding + rowStart * (cellHeight + gap);
            const w = cellWidth * (colEnd - colStart) + gap * (colEnd - colStart - 1);
            const h = cellHeight * (rowEnd - rowStart) + gap * (rowEnd - rowStart - 1);
            
            if (result) {
                const { img } = result;
                drawImageCover(ctx, img, x, y, w, h);
            }
        });

        // 下载
        const link = document.createElement('a');
        link.download = `collage_${Date.now()}.png`;
        link.href = exportCanvas.toDataURL('image/png');
        link.click();

        console.log('[Collage] 拼图已保存');
    });
}

// 暴露到全局作用域
window.openCollage = openCollage;
window.closeCollage = closeCollage;

console.log('[Collage] 拼图模块已加载');
