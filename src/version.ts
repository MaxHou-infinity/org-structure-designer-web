/**
 * 应用版本（单一来源）。
 * 由 vite.config.ts 注入 `__APP_VERSION__`（读取 package.json 的 version），
 * 所有 UI 版本显示统一从这取，避免各处硬编码版本号漂移。
 */
export const APP_VERSION: string = __APP_VERSION__ ?? '0.0.0';
