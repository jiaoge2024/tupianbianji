/**
 * Background Service Worker
 * 点击插件图标时打开独立窗口
 */

function extractGeminiError(data) {
    if (!data) return '未知错误';
    if (typeof data === 'string') return data;
    if (data.error?.message) return data.error.message;
    if (Array.isArray(data.error?.details) && data.error.details.length > 0) {
        const detail = data.error.details.find(item => item?.message) || data.error.details[0];
        if (detail?.message) return detail.message;
    }
    return data.message || '未知错误';
}

function extractGeminiImageData(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];

    for (const candidate of candidates) {
        const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        for (const part of parts) {
            const inlineData = part?.inlineData || part?.inline_data;
            if (inlineData?.data) {
                const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
                return `data:${mimeType};base64,${inlineData.data}`;
            }
        }
    }

    return null;
}

function isModelUnavailableError(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 404
        || message.includes('not found')
        || message.includes('unsupported')
        || message.includes('not supported')
        || message.includes('unknown model')
        || message.includes('invalid argument');
}

function normalizeApiKey(apiKey) {
    return String(apiKey || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[\u00A0\u3000]/g, ' ')
        .replace(/\s+/g, '')
        .trim();
}

async function requestGeminiImage({ apiKey, prompt, model, aspectRatio, imageSize }) {
    const normalizedApiKey = normalizeApiKey(apiKey);
    if (!normalizedApiKey) {
        throw new Error('API Key 为空或格式无效');
    }

    const requestUrl = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`);
    requestUrl.searchParams.set('key', normalizedApiKey);

    const response = await fetch(requestUrl.toString(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    aspectRatio,
                    imageSize
                }
            }
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(extractGeminiError(data) || `API 请求失败 (${response.status})`);
        error.status = response.status;
        throw error;
    }

    const imageDataUrl = extractGeminiImageData(data);
    if (!imageDataUrl) {
        throw new Error('Gemini 未返回图片数据');
    }

    return { imageDataUrl, modelUsed: model };
}

chrome.action.onClicked.addListener(() => {
    chrome.windows.create({
        url: 'index.html',
        type: 'popup',
        width: 1000,
        height: 700,
        left: 100,
        top: 100
    });
});

/**
 * OCR API 消息处理
 * 由于 CORS 限制，API 请求需要通过 background script 发送
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getAccessToken') {
        // 获取百度 Access Token
        const { apiKey, secretKey } = request;
        const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;

        fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    sendResponse({ success: false, error: data.error_description || data.error });
                } else {
                    sendResponse({
                        success: true,
                        accessToken: data.access_token,
                        expiresIn: data.expires_in || 2592000
                    });
                }
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true; // 保持消息通道开放以进行异步响应
    }

    if (request.action === 'callOCR') {
        // 调用百度 OCR API
        const { accessToken, imageBase64 } = request;
        const ocrUrl = `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${encodeURIComponent(accessToken)}`;

        fetch(ocrUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `image=${encodeURIComponent(imageBase64)}`
        })
            .then(response => response.json())
            .then(data => {
                if (data.error_code) {
                    sendResponse({ success: false, error: `错误 (${data.error_code}): ${data.error_msg}` });
                } else {
                    sendResponse({ success: true, result: data });
                }
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true; // 保持消息通道开放以进行异步响应
    }

    /**
     * AI 图像生成 API 消息处理 (Gemini)
     */
    if (request.action === 'startAIGeneration') {
        const {
            apiKey,
            prompt,
            model = 'gemini-3.1-flash-image-preview',
            aspectRatio = '1:1',
            imageSize = '1K'
        } = request;
        const fallbackModel = 'gemini-2.5-flash-image';

        (async () => {
            try {
                const result = await requestGeminiImage({
                    apiKey,
                    prompt,
                    model,
                    aspectRatio,
                    imageSize
                });
                sendResponse({ success: true, ...result });
            } catch (error) {
                if (model !== fallbackModel && isModelUnavailableError(error)) {
                    try {
                        const fallbackResult = await requestGeminiImage({
                            apiKey,
                            prompt,
                            model: fallbackModel,
                            aspectRatio,
                            imageSize
                        });
                        sendResponse({
                            success: true,
                            ...fallbackResult,
                            fallbackFrom: model
                        });
                        return;
                    } catch (fallbackError) {
                        sendResponse({ success: false, error: fallbackError.message });
                        return;
                    }
                }

                sendResponse({ success: false, error: error.message });
            }
        })();

        return true; // 保持消息通道开放以进行异步响应
    }

    /**
     * 下载远程图片并转换为 base64 (用于绕过 CORS)
     */
    if (request.action === 'fetchImageAsBase64') {
        const { imageUrl } = request;

        fetch(imageUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ success: true, dataUrl: reader.result });
                };
                reader.onerror = () => {
                    sendResponse({ success: false, error: '读取图片数据失败' });
                };
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true; // 保持消息通道开放以进行异步响应
    }

    /**
     * 下载模型文件（用于 AI 模型下载，绕过 CORS）
     */
    if (request.action === 'downloadModelBuffer') {
        const { modelUrl } = request;

        fetch(modelUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`模型下载失败: HTTP ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                // 将 ArrayBuffer 转为 base64 发送
                const uint8Array = new Uint8Array(buffer);
                let binary = '';
                const chunkSize = 65536;
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                    const chunk = uint8Array.subarray(i, i + chunkSize);
                    binary += String.fromCharCode.apply(null, chunk);
                }
                const base64 = btoa(binary);
                sendResponse({ success: true, modelBase64: base64 });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        return true; // 保持消息通道开放以进行异步响应
    }
});
