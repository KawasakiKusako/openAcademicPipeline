// Vite `?raw` 导入声明：主进程构建时把脚本源码内嵌进产物（如 scripts/perm-hook.js）
declare module '*?raw' {
  const content: string
  export default content
}
