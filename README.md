# 微博图床

微博图床是一个基于 Plasmo 与 React 18 重写的 Chrome Manifest V3 扩展，用于把本地图片、剪贴板图片、网页图片或视频当前帧上传到微博图床，并生成 URL、HTML、UBB 和 Markdown 外链。

当前仓库处于 Plasmo 迁移版本，核心上传、右键菜单、上传记录和选项页已经接入。历史实现中的部分细节仍在迁移和校准中。

## 功能

- 选择、拖拽、粘贴图片或图片 URL 上传。
- 支持批量上传，并可批量复制同一种格式的外链。
- 右键上传网页图片。
- 右键截取视频当前帧并上传。
- 生成 URL、HTML、UBB、Markdown 四种引用格式。
- 浏览微博微相册图片，并支持从微相册移除图片。
- 可选继承微博图片水印设置。
- 可选使用微博账号密码自动登录；两步验证账号不支持自动登录。
- 可选申请全站访问权限，用动态 `declarativeNetRequest` 规则为跨域图片请求伪造 `Referer`。
- 支持导出扩展日志，便于排查上传和登录问题。

## 使用

### 安装开发版

```bash
pnpm install
pnpm dev
```

`pnpm dev` 会生成热更新开发包：

```text
build/chrome-mv3-dev
```

在 Chrome 中打开 `chrome://extensions`，启用「开发者模式」，选择「加载已解压的扩展程序」，然后加载上面的目录。

生产构建使用：

```bash
pnpm build
```

构建产物位于：

```text
build/chrome-mv3-prod
```

如需打包发布压缩包：

```bash
pnpm package
```

### 上传图片

打开扩展弹窗后，可以通过以下方式上传：

1. 点击预览区域选择图片文件。
2. 将图片文件或文件夹拖入弹窗。
3. 在弹窗聚焦时粘贴剪贴板图片。
4. 粘贴可直接访问的图片 URL。
5. 在网页图片上右键，选择「把这张图片上传到微相册」。
6. 在网页视频上右键，选择「把当前的视频帧上传到微相册」。

上传完成后，点击对应行的 `Copy` 复制指定格式的外链。打开顶部的批量复制模式后，按钮会变为 `Copy All`，一次复制当前列表中所有已上传图片的同类外链。

### 外链格式

扩展会生成以下格式：

```text
URL:      https://...
HTML:     <img src="https://..." alt="filename">
UBB:      [IMG]https://...[/IMG]
Markdown: ![filename](https://...)
```

弹窗顶部可以切换协议与尺寸选项。当前 Plasmo 迁移版的默认外链会使用内置 CDN 模板；自定义模板的说明见 [自定义尺寸和链接](docs/custom-clip.md)。

### 上传记录

点击弹窗右上角的历史图标，或在扩展图标上右键选择「上传记录」，可进入上传记录页面。

记录页会读取微博微相册：

- 默认显示全部微相册图片。
- 可以切换到最新相册或前后相册。
- 点击图片打开原图。
- `Ctrl` / `Command` 点击图片可多选。
- 点击删除图标可从微相册移除单张或多张图片。

### 选项

在扩展选项页可以配置：

- `通知我更新详情`：扩展更新后自动打开更新说明。
- `继承微博图片水印`：上传时读取并沿用微博账号当前水印设置。
- `伪造 HTTP Referer`：申请 `*://*/*` 可选权限，用于读取部分限制跨域访问的网页图片。
- `使用账号和密码登录`：保存微博账号信息，在 Cookie 失效时尝试自动登录。

账号和密码保存在浏览器扩展的 `chrome.storage.sync` 中。若账号启用了两步验证，扩展无法完成自动登录，需要手动登录微博。

## 快捷键和右键菜单

默认快捷键：

- `Alt+Shift+W`：打开扩展弹窗。
- `Alt+Shift+T`：切换页面指针事件模式，便于在遮罩或特殊页面中右键选取图片和视频。

右键菜单：

- 扩展图标：打开上传记录、导出日志。
- 网页图片：上传当前图片到微相册。
- 网页视频：截取当前视频帧并上传。

## 开发

### 环境

- Node.js 18 或更高版本。
- pnpm 8。
- Chrome 110 或更高版本。

### 常用命令

```bash
pnpm dev        # 启动 Plasmo 开发构建
pnpm build      # 生成生产构建
pnpm package    # 生成发布包
pnpm typecheck  # TypeScript 类型检查
```

### 目录结构

```text
assets/                 扩展图标等静态资源
background/             MV3 后台 service worker
components/             React 组件
contents/               内容脚本
locales/                Plasmo i18n 消息
shared/                 存储、微博接口、运行时工具
tabs/                   扩展内页面：上传、记录、离屏登录辅助
README.md               项目说明
docs/custom-clip.md     自定义尺寸和链接说明
changelog.md            迁移版变更记录
```

### Manifest 和权限

Manifest 配置写在 `package.json` 的 `manifest` 字段中，由 Plasmo 生成最终扩展清单。

核心权限包括：

- `contextMenus`：创建右键菜单。
- `declarativeNetRequestWithHostAccess`：为微博接口和跨域图片请求动态设置请求头。
- `downloads`：导出日志。
- `notifications`：上传、登录、错误提示。
- `scripting`：在页面中捕获视频帧。
- `storage`：保存设置和上传记录。
- `tabs` / `windows`：打开扩展页面、微博登录页和离屏登录辅助窗口。

默认 host permissions 限定在微博、Sina 和 Sinaimg 相关域名。`*://*/*` 是可选权限，只在用户开启「伪造 HTTP Referer」时请求。

## 已知限制

- 微博接口没有公开稳定契约，上传、相册读取和账号登录可能受微博页面策略变化影响。
- 自动账号登录不支持需要两步验证的微博账号。
- 右键上传远程图片时，部分站点需要开启「伪造 HTTP Referer」才能读取图片内容。
- 当前外链生成默认使用内置 CDN 模板；仅当自定义值包含占位符时才会完全按自定义模板生成链接。
- `docs/custom-clip.md` 中提到的部分历史微博尺寸参数依赖微博 CDN 行为，可能随微博服务变化而失效。

## 反馈

- GitHub Issues: <https://github.com/Semibold/Weibo-Picture-Store/issues>
- 邮件: <mailto:i@hub.moe>
