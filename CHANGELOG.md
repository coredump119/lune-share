# 更新记录

升级方法：在站点文件夹里打开命令行，运行 `npm run update`。数据在 Cloudflare 上，升级不会动它。

## 1.1.0 · 2026-09-21
- 新增 `npm run update`：一条命令拉取最新代码、装依赖、跑数据库迁移、部署，自动保留你的配置和背景图
- 数据库改成带版本号的迁移（`migrations/`），以后加字段不会让老站报错
- 后台有新版本时会显示提示；「用量」页显示当前版本

## 1.0.0 · 2026-09-21
- 首个公开版本
- 从 1.0.0 升级：这个版本还没有 `npm run update`，第一次要先在站点文件夹里运行下面这条把升级脚本拿过来，之后就都是 `npm run update` 了：
  ```bash
  curl -fsSL https://raw.githubusercontent.com/coredump119/lune-share/main/scripts/update.mjs -o scripts/update.mjs && node scripts/update.mjs
  ```
