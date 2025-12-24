/**
 * 图标生成脚本 - 利用 Canvas 生成 16, 48, 128 尺寸的 Logo
 */
const sizes = [16, 48, 128];

// 我们这里使用一个通用的绘制函数
function drawLogo(ctx, size) {
    const scale = size / 128;

    // 1. 绘制圆角背景
    ctx.fillStyle = "#1e1e1e"; // 对应我们的 sidebar-bg
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 20 * scale);
    ctx.fill();

    // 2. 绘制裁切边框符号 (蓝色)
    ctx.strokeStyle = "#3b82f6"; // 对应我们的 accent-color
    ctx.lineWidth = 8 * scale;
    ctx.lineJoin = "round";

    // 绘制一个带有缺口的矩形，代表裁切
    const p = 30 * scale; // padding
    ctx.beginPath();
    ctx.moveTo(p, p + 20 * scale);
    ctx.lineTo(p, p);
    ctx.lineTo(p + 20 * scale, p);

    ctx.moveTo(size - p - 20 * scale, p);
    ctx.lineTo(size - p, p);
    ctx.lineTo(size - p, p + 20 * scale);

    ctx.moveTo(size - p, size - p - 20 * scale);
    ctx.lineTo(size - p, size - p);
    ctx.lineTo(size - p - 20 * scale, size - p);

    ctx.moveTo(p + 20 * scale, size - p);
    ctx.lineTo(p, size - p);
    ctx.lineTo(p, size - p - 20 * scale);
    ctx.stroke();

    // 3. 中心画一个小点
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 6 * scale, 0, Math.PI * 2);
    ctx.fill();
}

console.log("由于环境限制，请手动将此代码在浏览器控制台运行，或等待后续 AI 绘图恢复。");
console.log("或者，我们可以直接在 index.html 中利用 CSS 伪元素绘制一个华丽的图标，效果一样惊艳。");
