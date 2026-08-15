import { api } from './api'

// 自定义 CSS 注入管理：
// 从后端（127.0.0.1:11455）fetch CSS 文本 → 注入 <style id="oap-custom-css">。
// 为什么不用 <link>：index.html CSP 的 style-src 不含 11455，<link> 会被拦；
// 'unsafe-inline' 放行 <style> 元素，append 到 head 末尾天然覆盖打包 CSS（同特异性后者胜出）。
let styleEl: HTMLStyleElement | null = null

export function applyCustomCss(css: string | null): void {
  if (!css) {
    styleEl?.remove()
    styleEl = null
    return
  }
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'oap-custom-css'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
}

// 拉取开关状态与 CSS 文本并应用（开启 → 注入；关闭/为空 → 移除）
export async function refreshCustomCss(): Promise<void> {
  try {
    const [status, css] = await Promise.all([api.styleStatus(), api.styleCss()])
    applyCustomCss(status.enabled && css.content.trim() ? css.content : null)
  } catch {
    // 后端不可达时静默（保持现状）
  }
}
