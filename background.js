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
