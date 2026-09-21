# LUNE Share

给 Midjourney 创作者的**邀请制 prompt 分享站**。你上传 prompt 和图，拿到邀请码的人才能看。
整个站跑在**你自己的** Cloudflare 免费账号上，数据、图片、邀请码都只在你手里，不经过任何别人的服务器。

**图文教程 → https://coredump119.github.io/lune-share/**

## 它能做什么

- **一人一码**：每个邀请码可以设有效期、设备数上限，随时作废，作废后对方立刻进不来
- **按集合授权**：同一个站放多个词包，每个码只看得到你勾给它的集合
- **投稿码**：可以让信任的人投稿，投稿先进待审核，你通过了才公开
- **隐私**：图片在浏览器里重新编码后才上传，MJ 写在图片里的 prompt 和 `--p` 不会到服务器；`--p` 逐条决定公不公开
- **顺手**：拖 MJ 原图自动读出 prompt、⌘V 粘贴图片、批量操作、排序、搜索、标签、手机布局、深浅色
- **导入导出**：支持导入 [LUNE](https://github.com/coredump119/lune-releases) 的 `.lune.json`；一键导出 `.lune.json` / Word
- **免费**：Cloudflare Pages + D1 + KV 的免费额度足够个人用，不需要绑卡

## 十分钟装好

需要：一个 Cloudflare 账号（免费）、[Node.js](https://nodejs.org) 18 或更新。

```bash
git clone https://github.com/coredump119/lune-share.git my-prompts
cd my-prompts
npm install --legacy-peer-deps
npm run setup
```

`npm run setup` 会打开浏览器让你登录 Cloudflare，问你四个问题（站点 id、站点名字、一行小字、图片存哪），然后自动建数据库、图片存储、密钥并部署。结束时会打印你的网址和**管理密钥**。

打开 `你的网址/#/admin`，粘贴管理密钥，在「邀请码」里生成第一个码，就可以开始上传了。

不会用 git 也没关系：点页面右上角绿色的 **Code → Download ZIP**，解压后在那个文件夹里打开终端，从 `npm install` 开始。

## 之后

| 想做的事 | 怎么做 |
|---|---|
| 改站点名字 / 小字 | 改 `wrangler.toml` 里的 `SITE_NAME` / `SITE_TAGLINE`，然后 `npm run deploy` |
| 只允许自己批量导出 | `wrangler.toml` 里 `EXPORT_FOR = "admin"`，然后 `npm run deploy` |
| 换背景图 | 替换 `public/day.jpg` 和 `public/night.jpg`，然后 `npm run deploy` |
| 拿到模板的新版本 | `git pull`，`npm install --legacy-peer-deps`，`npm run db:apply`，`npm run deploy` |
| 忘了管理密钥 | 看项目文件夹里的 `.dev.vars` |
| 绑自己的域名 | Cloudflare 后台 → Workers & Pages → 你的项目 → Custom domains |

`wrangler.toml` 和 `.dev.vars` 是 setup 为你生成的，已被 git 忽略。**换电脑前把这两个文件备份好。**

## 免费额度（2026 年）

| | 免费额度 | 大概意味着 |
|---|---|---|
| Pages Functions | 每天 10 万次请求 | 一个访客翻一遍约几十次 |
| D1 | 5 GB，每天 500 万行读 | 文字永远用不完 |
| KV（默认图片存储） | 共 1 GB，每天 1000 次写、10 万次读 | 约 3000 张图，一天最多传 1000 张；图片在访客浏览器里缓存一天 |
| R2（可选） | 10 GB | 要在 Cloudflare 绑一次卡才能开通 |

数字来自 Cloudflare 官方文档，以[官网](https://developers.cloudflare.com/workers/platform/pricing/)为准。超出免费额度时 Cloudflare 会直接拒绝请求，**不会扣费**（KV / D1 / Pages 免费档没有付费项；R2 绑卡后超额才计费）。

## 结构

```
src/                 React 前端（Vite）
functions/api/       Cloudflare Pages Functions：鉴权、邀请码、prompt、图片
schema.sql           D1 表结构
scripts/setup.mjs    一键配置
docs/                教程页（GitHub Pages）
```

安全模型：邀请码只存 SHA-256；进入后发一个 HMAC 签名的 cookie，每次请求都会回查这个码有没有被作废或过期；图片接口同样校验集合权限；管理端用单独的密钥和 cookie。

## English, briefly

An invite-only gallery for sharing Midjourney prompts, deployed to **your own** free Cloudflare account (Pages + D1 + KV, no card). One code per person, revocable, optional expiry and device cap, per-collection access, contributor codes with moderation, client-side image re-encoding so MJ metadata never leaves the browser, LUNE import, `.lune.json` / Word export. `npm install --legacy-peer-deps && npm run setup` does everything. The UI is in Chinese.

MIT. Made by NullPointer, sister project of [LUNE](https://github.com/coredump119/lune-releases).
