/**
 * Background Service Worker
 * 点击插件图标时打开独立窗口
 */

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
});
