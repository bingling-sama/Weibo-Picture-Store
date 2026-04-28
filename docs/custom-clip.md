# 自定义尺寸和链接

上传页顶部的尺寸选项用于决定生成外链时使用的图片地址。当前 Plasmo 迁移版保留了历史 UI，但默认外链会优先使用内置 CDN 模板：

```text
https://cdn.ipfsscan.io/weibo/large/{{basename}}
```

如果希望完全控制生成的图片地址，需要在「自定义尺寸或链接」输入框中填写带占位符的模板。

## 占位符

支持以下占位符：

| 占位符 | 含义 | 示例 |
| --- | --- | --- |
| `{{pid}}` | 微博返回的图片 ID | `abc123def456` |
| `{{extname}}` | 扩展名 | `.jpg` 或 `.gif` |
| `{{basename}}` | 图片 ID 加扩展名 | `abc123def456.jpg` |

示例：

```text
https://cdn.ipfsscan.io/weibo/large/{{basename}}
```

生成结果类似：

```text
https://cdn.ipfsscan.io/weibo/large/abc123def456.jpg
```

也可以使用自己的反代或 CDN：

```text
https://img.example.com/weibo/{{pid}}{{extname}}
```

## 历史尺寸参数

历史版本支持直接填写微博 CDN 的尺寸路径，例如：

```text
large
mw690
thumbnail
wap800
wap720
wap360
wap240
wap180
wap50
bmiddle
small
thumb300
thumb180
thumb150
square
```

当前迁移版 UI 仍提供这些候选值，但实际链接生成逻辑只会在自定义值包含 `{{pid}}`、`{{extname}}` 或 `{{basename}}` 时启用完整模板。仅填写 `wap800` 这类尺寸值时，生成结果仍会走内置 CDN 模板。

## 格式输出

同一个自定义链接会用于四种输出格式：

```text
URL:      https://img.example.com/weibo/abc123def456.jpg
HTML:     <img src="https://img.example.com/weibo/abc123def456.jpg" alt="filename">
UBB:      [IMG]https://img.example.com/weibo/abc123def456.jpg[/IMG]
Markdown: ![filename](https://img.example.com/weibo/abc123def456.jpg)
```

## 注意事项

- 模板必须生成浏览器可访问的完整 URL。
- 如果使用协议相对地址，例如 `//example.com/weibo/{{basename}}`，复制到某些 Markdown 环境后可能无法正确预览。
- 上传 GIF 时扩展名会保持为 `.gif`；其他支持类型通常会生成 `.jpg`。
- 微博 CDN 的尺寸参数属于历史行为，不能保证长期稳定。
