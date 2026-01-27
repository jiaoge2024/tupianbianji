/**
 * LaMa Inpainting Module
 * 使用 LaMa ONNX 模型实现本地图像修复（消除笔功能）
 */

const LamaInpaint = {
    session: null,
    isLoading: false,
    MODEL_URL: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx?download=true',
    DB_NAME: 'ImageEditorModelCache',
    STORE_NAME: 'models',
    MODEL_KEY: 'lama_fp32',
    INPUT_SIZE: 512, // LaMa 模型固定输入尺寸

    /**
     * 打开 IndexedDB 数据库
     */
    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
        });
    },

    /**
     * 从 IndexedDB 缓存获取模型
     */
    async getModelFromCache() {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.get(this.MODEL_KEY);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            });
        } catch (e) {
            console.warn('[LaMa] IndexedDB 读取失败:', e);
            return null;
        }
    },

    /**
     * 保存模型到 IndexedDB 缓存
     */
    async saveModelToCache(buffer) {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.put(buffer, this.MODEL_KEY);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
            });
        } catch (e) {
            console.warn('[LaMa] IndexedDB 保存失败:', e);
        }
    },

    /**
     * 加载模型（优先从缓存，否则从 CDN 下载）
     * @param {Function} onProgress - 下载进度回调 (0-100)
     */
    async loadModel(onProgress = () => { }) {
        if (this.session) {
            return this.session;
        }

        if (this.isLoading) {
            // 等待其他加载完成
            while (this.isLoading) {
                await new Promise(r => setTimeout(r, 100));
            }
            return this.session;
        }

        this.isLoading = true;

        try {
            // 检查 ONNX Runtime 是否可用
            if (typeof ort === 'undefined') {
                throw new Error('ONNX Runtime Web 未加载，请确保已引入 onnxruntime-web.min.js');
            }

            // 配置 WASM 文件路径（Chrome 扩展需要使用 chrome.runtime.getURL）
            const wasmPath = chrome.runtime.getURL('lib/');
            ort.env.wasm.wasmPaths = wasmPath;

            // 禁用 WebGPU 以避免兼容性问题，使用更稳定的 WASM 后端
            ort.env.wasm.numThreads = 1; // 单线程避免 SharedArrayBuffer 问题

            console.log('[LaMa] WASM 路径配置:', wasmPath);

            // 尝试从缓存读取
            console.log('[LaMa] 检查本地缓存...');
            let modelBuffer = await this.getModelFromCache();

            if (modelBuffer) {
                console.log('[LaMa] 从缓存加载模型');
                onProgress(100);
            } else {
                // 从 CDN 下载（直接 fetch，扩展页面不受 CORS 限制）
                console.log('[LaMa] 开始下载模型（约208MB）...');
                onProgress(5);

                const response = await fetch(this.MODEL_URL);

                if (!response.ok) {
                    throw new Error(`模型下载失败: HTTP ${response.status}`);
                }

                const contentLength = response.headers.get('content-length');
                const total = contentLength ? parseInt(contentLength, 10) : 218103808; // 约208MB
                let loaded = 0;

                const reader = response.body.getReader();
                const chunks = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    chunks.push(value);
                    loaded += value.length;
                    const progress = Math.min(95, Math.round((loaded / total) * 95));
                    onProgress(progress);
                }

                // 合并所有 chunks
                modelBuffer = new Uint8Array(loaded);
                let offset = 0;
                for (const chunk of chunks) {
                    modelBuffer.set(chunk, offset);
                    offset += chunk.length;
                }

                console.log(`[LaMa] 下载完成: ${(loaded / 1024 / 1024).toFixed(1)}MB`);

                // 缓存到 IndexedDB
                console.log('[LaMa] 缓存模型到本地...');
                await this.saveModelToCache(modelBuffer);
                onProgress(100);
            }

            // 创建推理会话
            console.log('[LaMa] 初始化推理会话...');
            const sessionOptions = {
                executionProviders: ['wasm'], // 使用 WASM 后端，在扩展中更稳定
                graphOptimizationLevel: 'all'
            };

            this.session = await ort.InferenceSession.create(modelBuffer.buffer, sessionOptions);
            console.log('[LaMa] 模型加载完成');

            return this.session;
        } catch (error) {
            console.error('[LaMa] 模型加载失败:', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    },

    /**
     * 预处理图像和掩码
     * @param {HTMLCanvasElement} imageCanvas - 原始图像 Canvas
     * @param {HTMLCanvasElement} maskCanvas - 掩码 Canvas（涂抹区域为白色）
     * @returns {Object} 包含 image 和 mask Tensor
     */
    prepareInputs(imageCanvas, maskCanvas) {
        const size = this.INPUT_SIZE;

        // 创建临时 Canvas 进行缩放
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tempCtx = tempCanvas.getContext('2d');

        // 缩放原图
        tempCtx.drawImage(imageCanvas, 0, 0, size, size);
        const imageData = tempCtx.getImageData(0, 0, size, size);

        // 缩放掩码
        tempCtx.clearRect(0, 0, size, size);
        tempCtx.drawImage(maskCanvas, 0, 0, size, size);
        const maskData = tempCtx.getImageData(0, 0, size, size);

        // 转换为 Tensor 格式
        // LaMa 输入格式: image [1, 3, 512, 512], mask [1, 1, 512, 512]
        const imageArray = new Float32Array(3 * size * size);
        const maskArray = new Float32Array(1 * size * size);

        for (let i = 0; i < size * size; i++) {
            const idx = i * 4;
            // RGB 归一化到 [0, 1]
            imageArray[i] = imageData.data[idx] / 255.0;                    // R
            imageArray[size * size + i] = imageData.data[idx + 1] / 255.0;  // G
            imageArray[2 * size * size + i] = imageData.data[idx + 2] / 255.0; // B

            // 掩码：白色区域 = 1（需要修复），黑色 = 0
            maskArray[i] = maskData.data[idx] > 128 ? 1.0 : 0.0;
        }

        const imageTensor = new ort.Tensor('float32', imageArray, [1, 3, size, size]);
        const maskTensor = new ort.Tensor('float32', maskArray, [1, 1, size, size]);

        return { image: imageTensor, mask: maskTensor };
    },

    /**
     * 执行图像修复推理
     * @param {HTMLCanvasElement} imageCanvas - 原始图像
     * @param {HTMLCanvasElement} maskCanvas - 掩码
     * @returns {HTMLCanvasElement} 修复后的图像
     */
    async run(imageCanvas, maskCanvas) {
        if (!this.session) {
            throw new Error('模型未加载，请先调用 loadModel()');
        }

        console.log('[LaMa] 开始推理...');
        const startTime = performance.now();

        // 准备输入
        const inputs = this.prepareInputs(imageCanvas, maskCanvas);

        // 打印模型输入输出信息
        console.log('[LaMa] 模型输入名称:', this.session.inputNames);
        console.log('[LaMa] 模型输出名称:', this.session.outputNames);
        console.log('[LaMa] 图像 Tensor 形状:', inputs.image.dims);
        console.log('[LaMa] 掩码 Tensor 形状:', inputs.mask.dims);

        // 执行推理 - 使用模型实际的输入名称
        const inputNames = this.session.inputNames;
        const feeds = {};
        feeds[inputNames[0]] = inputs.image;  // 第一个输入是图像
        feeds[inputNames[1]] = inputs.mask;   // 第二个输入是掩码

        const results = await this.session.run(feeds);

        // 获取输出
        const outputTensor = results.inpainted || results.output;
        if (!outputTensor) {
            // 尝试获取第一个输出
            const outputKeys = Object.keys(results);
            if (outputKeys.length > 0) {
                const resultCanvas = this.tensorToCanvas(results[outputKeys[0]]);
                const endTime = performance.now();
                console.log(`[LaMa] 推理完成，耗时: ${(endTime - startTime).toFixed(0)}ms`);
                return resultCanvas;
            }
            throw new Error('模型输出格式不正确');
        }

        const resultCanvas = this.tensorToCanvas(outputTensor);
        const endTime = performance.now();
        console.log(`[LaMa] 推理完成，耗时: ${(endTime - startTime).toFixed(0)}ms`);

        return resultCanvas;
    },

    /**
     * 将 Tensor 转换为 Canvas
     * @param {ort.Tensor} tensor - 输出 Tensor [1, 3, 512, 512]
     * @returns {HTMLCanvasElement}
     */
    tensorToCanvas(tensor) {
        const size = this.INPUT_SIZE;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);

        const data = tensor.data;

        // 检测数据范围，自动判断是 [0,1] 还是 [0,255]
        let maxVal = 0;
        let minVal = Infinity;
        for (let i = 0; i < Math.min(1000, data.length); i++) {
            if (data[i] > maxVal) maxVal = data[i];
            if (data[i] < minVal) minVal = data[i];
        }
        console.log(`[LaMa] 输出数据范围: min=${minVal.toFixed(3)}, max=${maxVal.toFixed(3)}`);

        // 如果最大值 > 2，假设是 [0, 255] 范围
        const needsScale = maxVal <= 2.0;
        const scale = needsScale ? 255.0 : 1.0;

        console.log(`[LaMa] 使用缩放因子: ${scale}`);

        for (let i = 0; i < size * size; i++) {
            const idx = i * 4;
            // R, G, B 通道分别存储
            const r = data[i] * scale;
            const g = data[size * size + i] * scale;
            const b = data[2 * size * size + i] * scale;

            imageData.data[idx] = Math.min(255, Math.max(0, Math.round(r)));
            imageData.data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
            imageData.data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
            imageData.data[idx + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    },

    /**
     * 检查模型是否已缓存
     */
    async isModelCached() {
        const cached = await this.getModelFromCache();
        return cached !== null && cached !== undefined;
    },

    /**
     * 清除缓存的模型
     */
    async clearCache() {
        try {
            const db = await this.openDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.delete(this.MODEL_KEY);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    console.log('[LaMa] 缓存已清除');
                    resolve();
                };
            });
        } catch (e) {
            console.warn('[LaMa] 清除缓存失败:', e);
        }
    }
};

// 导出到全局
window.LamaInpaint = LamaInpaint;
