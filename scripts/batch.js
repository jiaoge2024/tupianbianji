/**
 * 批量操作模块 - 批量重命名功能
 * 支持批量上传图片、重命名规则配置、导出到本地和覆盖原图片
 */

// 全局变量
let batchImageFiles = [];
let batchManager = null;

/**
 * 打开批量重命名模态框
 */
function openBatchRename() {
    console.log('[Batch] 打开批量重命名模态框');
    
    const modal = document.getElementById('batch-modal');
    if (!modal) {
        console.error('[Batch] 找不到 batch-modal 元素');
        alert('批量重命名功能加载失败');
        return;
    }
    
    // 显示模态框
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    console.log('[Batch] 模态框已显示');
    
    // 初始化事件（只执行一次）
    if (!batchManager) {
        initBatchEvents();
    }
}

/**
 * 关闭批量重命名模态框
 */
function closeBatchRename() {
    const modal = document.getElementById('batch-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

/**
 * 初始化批量重命名事件
 */
function initBatchEvents() {
    console.log('[Batch] 初始化事件');
    
    batchManager = {
        modal: document.getElementById('batch-modal'),
        closeBtn: document.getElementById('batch-close'),
        uploadArea: document.getElementById('batch-upload-area'),
        fileInput: document.getElementById('batch-file-input'),
        listSection: document.getElementById('batch-list-section'),
        listContainer: document.getElementById('batch-list-container'),
        countDisplay: document.getElementById('batch-count'),
        clearBtn: document.getElementById('batch-clear'),
        previewList: document.getElementById('batch-preview-list'),
        exportBtn: document.getElementById('batch-export'),
        overwriteBtn: document.getElementById('batch-overwrite'),
        usePrefix: document.getElementById('batch-use-prefix'),
        prefixInput: document.getElementById('batch-prefix'),
        useSuffix: document.getElementById('batch-use-suffix'),
        suffixInput: document.getElementById('batch-suffix'),
        namingRadios: document.querySelectorAll('input[name="batch-naming"]'),
        startNumInput: document.getElementById('batch-start-num'),
        numDigitsSelect: document.getElementById('batch-num-digits'),
        startNumRow: document.getElementById('batch-start-num-row')
    };
    
    const m = batchManager;
    
    // 关闭按钮
    if (m.closeBtn) {
        m.closeBtn.addEventListener('click', closeBatchRename);
    }
    
    // 点击模态框外部关闭
    if (m.modal) {
        m.modal.addEventListener('click', (e) => {
            if (e.target === m.modal) closeBatchRename();
        });
    }
    
    // 上传区域点击
    if (m.uploadArea && m.fileInput) {
        m.uploadArea.addEventListener('click', () => m.fileInput.click());
    }
    
    // 文件选择
    if (m.fileInput) {
        m.fileInput.addEventListener('change', (e) => handleBatchFiles(e.target.files));
    }
    
    // 拖拽上传
    if (m.uploadArea) {
        m.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            m.uploadArea.classList.add('dragover');
        });
        
        m.uploadArea.addEventListener('dragleave', () => {
            m.uploadArea.classList.remove('dragover');
        });
        
        m.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            m.uploadArea.classList.remove('dragover');
            handleBatchFiles(e.dataTransfer.files);
        });
    }
    
    // 清空按钮
    if (m.clearBtn) {
        m.clearBtn.addEventListener('click', clearBatchFiles);
    }
    
    // 重命名规则变化监听
    if (m.usePrefix) m.usePrefix.addEventListener('change', updateBatchPreview);
    if (m.prefixInput) m.prefixInput.addEventListener('input', updateBatchPreview);
    if (m.useSuffix) m.useSuffix.addEventListener('change', updateBatchPreview);
    if (m.suffixInput) m.suffixInput.addEventListener('input', updateBatchPreview);
    
    m.namingRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            handleBatchNamingChange();
            updateBatchPreview();
        });
    });
    
    if (m.startNumInput) m.startNumInput.addEventListener('input', updateBatchPreview);
    if (m.numDigitsSelect) m.numDigitsSelect.addEventListener('change', updateBatchPreview);
    
    // 导出和覆盖按钮
    if (m.exportBtn) m.exportBtn.addEventListener('click', exportBatchFiles);
    if (m.overwriteBtn) m.overwriteBtn.addEventListener('click', overwriteBatchFiles);
    
    console.log('[Batch] 事件初始化完成');
}

/**
 * 处理上传的文件
 */
function handleBatchFiles(files) {
    if (!files || files.length === 0) return;
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length === 0) {
        alert('请选择图片文件');
        return;
    }
    
    // 添加新文件到列表
    imageFiles.forEach(file => {
        const exists = batchImageFiles.some(f => f.name === file.name && f.size === file.size);
        if (!exists) {
            batchImageFiles.push(file);
        }
    });
    
    updateBatchUI();
    updateBatchPreview();
}

/**
 * 更新界面显示
 */
function updateBatchUI() {
    const m = batchManager;
    if (!m) return;
    
    // 更新计数
    if (m.countDisplay) m.countDisplay.textContent = batchImageFiles.length;
    
    // 显示/隐藏列表区域
    if (m.listSection) {
        m.listSection.style.display = batchImageFiles.length > 0 ? 'block' : 'none';
    }
    
    // 渲染列表
    if (batchImageFiles.length > 0 && m.listContainer) {
        renderBatchList();
    }
    
    // 更新按钮状态
    const hasFiles = batchImageFiles.length > 0;
    if (m.exportBtn) m.exportBtn.disabled = !hasFiles;
    if (m.overwriteBtn) m.overwriteBtn.disabled = !hasFiles;
}

/**
 * 渲染图片列表
 */
function renderBatchList() {
    const m = batchManager;
    if (!m || !m.listContainer) return;
    
    m.listContainer.innerHTML = '';
    
    batchImageFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'batch-list-item';
        
        // 创建缩略图
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = item.querySelector('.batch-item-thumb');
            if (img) img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        
        const size = formatBatchFileSize(file.size);
        
        item.innerHTML = `
            <img class="batch-item-thumb" src="" alt="${file.name}">
            <div class="batch-item-info">
                <div class="batch-item-name">${file.name}</div>
                <div class="batch-item-size">${size}</div>
            </div>
            <button class="batch-item-remove" data-index="${index}" title="移除">×</button>
        `;
        
        const removeBtn = item.querySelector('.batch-item-remove');
        removeBtn.addEventListener('click', () => removeBatchFile(index));
        
        m.listContainer.appendChild(item);
    });
}

/**
 * 格式化文件大小
 */
function formatBatchFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 移除单个文件
 */
function removeBatchFile(index) {
    batchImageFiles.splice(index, 1);
    updateBatchUI();
    updateBatchPreview();
}

/**
 * 清空所有文件
 */
function clearBatchFiles() {
    batchImageFiles = [];
    if (batchManager && batchManager.fileInput) {
        batchManager.fileInput.value = '';
    }
    updateBatchUI();
    updateBatchPreview();
}

/**
 * 处理命名方式变化
 */
function handleBatchNamingChange() {
    const m = batchManager;
    if (!m) return;
    
    const selectedRadio = document.querySelector('input[name="batch-naming"]:checked');
    if (!selectedRadio || !m.startNumRow) return;
    
    const selectedValue = selectedRadio.value;
    m.startNumRow.style.display = selectedValue === 'sequence' ? 'flex' : 'none';
}

/**
 * 生成新文件名
 */
function generateBatchNewName(file, index) {
    const m = batchManager;
    
    const selectedRadio = document.querySelector('input[name="batch-naming"]:checked');
    const namingType = selectedRadio ? selectedRadio.value : 'sequence';
    
    const prefix = (m && m.usePrefix && m.usePrefix.checked) ? (m.prefixInput ? m.prefixInput.value : '') : '';
    const suffix = (m && m.useSuffix && m.useSuffix.checked) ? (m.suffixInput ? m.suffixInput.value : '') : '';
    const ext = file.name.split('.').pop();
    
    let namePart = '';
    
    switch (namingType) {
        case 'sequence':
            const startNum = (m && m.startNumInput) ? (parseInt(m.startNumInput.value) || 1) : 1;
            const digits = (m && m.numDigitsSelect) ? (parseInt(m.numDigitsSelect.value) || 3) : 3;
            const num = (startNum + index).toString().padStart(digits, '0');
            namePart = num;
            break;
            
        case 'timestamp':
            namePart = Date.now().toString() + '_' + index;
            break;
            
        case 'datetime':
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hour = String(now.getHours()).padStart(2, '0');
            const minute = String(now.getMinutes()).padStart(2, '0');
            const second = String(now.getSeconds()).padStart(2, '0');
            namePart = `${year}${month}${day}_${hour}${minute}${second}_${index}`;
            break;
    }
    
    return `${prefix}${namePart}${suffix}.${ext}`;
}

/**
 * 更新预览列表
 */
function updateBatchPreview() {
    const m = batchManager;
    if (!m || !m.previewList) return;
    
    if (batchImageFiles.length === 0) {
        m.previewList.innerHTML = '<p class="batch-empty-hint">请先上传图片</p>';
        return;
    }
    
    m.previewList.innerHTML = '';
    const previewCount = Math.min(batchImageFiles.length, 5);
    
    for (let i = 0; i < previewCount; i++) {
        const file = batchImageFiles[i];
        const newName = generateBatchNewName(file, i);
        
        const item = document.createElement('div');
        item.className = 'batch-preview-item';
        item.innerHTML = `
            <span class="batch-preview-old" title="${file.name}">${file.name}</span>
            <span class="batch-preview-arrow">→</span>
            <span class="batch-preview-new" title="${newName}">${newName}</span>
        `;
        
        m.previewList.appendChild(item);
    }
    
    if (batchImageFiles.length > 5) {
        const more = document.createElement('div');
        more.className = 'batch-preview-item';
        more.innerHTML = `<span class="batch-preview-new">...还有 ${batchImageFiles.length - 5} 张图片</span>`;
        m.previewList.appendChild(more);
    }
}

/**
 * 导出文件到本地
 */
async function exportBatchFiles() {
    if (batchImageFiles.length === 0) return;
    
    const m = batchManager;
    if (!m || !m.exportBtn) return;
    
    m.exportBtn.disabled = true;
    m.exportBtn.textContent = '导出中...';
    
    try {
        const zip = new JSZip();
        const folder = zip.folder('renamed_images');
        
        for (let i = 0; i < batchImageFiles.length; i++) {
            const file = batchImageFiles[i];
            const newName = generateBatchNewName(file, i);
            const arrayBuffer = await file.arrayBuffer();
            folder.file(newName, arrayBuffer);
        }
        
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batch_rename_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('[Batch] 导出成功');
    } catch (error) {
        console.error('[Batch] 导出失败:', error);
        alert('导出失败，请重试');
    } finally {
        if (m.exportBtn) {
            m.exportBtn.disabled = false;
            m.exportBtn.textContent = '📥 导出到本地';
        }
    }
}

/**
 * 覆盖原图片（浏览器限制，实际实现为逐个下载）
 */
async function overwriteBatchFiles() {
    if (batchImageFiles.length === 0) return;
    
    const m = batchManager;
    if (!m || !m.overwriteBtn) return;
    
    const confirmMsg = `确定要下载 ${batchImageFiles.length} 张重命名后的图片吗？\n注意：浏览器安全限制无法直接覆盖原文件，将逐个下载新文件。`;
    if (!confirm(confirmMsg)) return;
    
    m.overwriteBtn.disabled = true;
    m.overwriteBtn.textContent = '下载中...';
    
    try {
        for (let i = 0; i < batchImageFiles.length; i++) {
            const file = batchImageFiles[i];
            const newName = generateBatchNewName(file, i);
            
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = newName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log('[Batch] 下载完成');
    } catch (error) {
        console.error('[Batch] 下载失败:', error);
        alert('下载失败，请重试');
    } finally {
        if (m.overwriteBtn) {
            m.overwriteBtn.disabled = false;
            m.overwriteBtn.textContent = '💾 覆盖原图片';
        }
    }
}

// 暴露到全局作用域
window.openBatchRename = openBatchRename;
window.closeBatchRename = closeBatchRename;

console.log('[Batch] 批量重命名模块已加载');
