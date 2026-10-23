# Third-Party Notices / 第三方依赖说明

CallFlow 使用以下开源依赖。许可证信息取自各依赖包 `package.json` 中的 `license` 字段（2026-10-23 核对）。完整依赖树与精确版本见 `package-lock.json`；每个包的完整许可证文本位于安装后的 `node_modules/<package>/` 目录中。

## Runtime dependencies

| Package | Version installed | License | Project |
| --- | --- | --- | --- |
| react | 19.3.1 | MIT | https://github.com/facebook/react |
| react-dom | 19.3.1 | MIT | https://github.com/facebook/react |
| react-router-dom | 7.18.4 | MIT | https://github.com/remix-run/react-router |
| express | 5.3.0 | MIT | https://github.com/expressjs/express |
| zod | 3.25.76 | MIT | https://github.com/colinhacks/zod |
| date-fns | 4.4.0 | MIT | https://github.com/date-fns/date-fns |
| lucide-react | 0.468.0 | ISC | https://github.com/lucide-icons/lucide |

## Development dependencies

| Package | Version installed | License | Project |
| --- | --- | --- | --- |
| vite | 6.4.5 | MIT | https://github.com/vitejs/vite |
| typescript | 5.8.3 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @vitejs/plugin-react | 4.7.0 | MIT | https://github.com/vitejs/vite-plugin-react |
| @types/react | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | 19.3.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| concurrently | 9.2.5 | MIT | https://github.com/open-cli-tools/concurrently |
| playwright-core | 1.64.1 | Apache-2.0 | https://github.com/microsoft/playwright |
| caniuse-lite | 1.0.30001818 | CC-BY-4.0 | https://github.com/browserslist/caniuse-lite |

> `caniuse-lite` 是 `browserslist` 的传递开发依赖，仅在构建阶段使用，不进入运行时产物。其 CC-BY-4.0 许可证要求保留署名；本说明即作为归属记录。若后续调整构建链使该依赖进入分发产物，请重新评估。

## Runtime platform

- **Node.js**（含内置 `node:sqlite`）由使用者自行安装，不属于本仓库分发内容。Node.js 及其依赖的许可证见 Node.js 发行包。
- **Microsoft Edge** 仅用于本机 UI 冒烟测试，不属于本仓库分发内容。

## Notes

- `package-lock.json` 中的 registry 地址已规范为 `https://registry.npmjs.org/`。
- 未直接引入远程字体、CDN 脚本、分析 SDK、图表库或 UI 组件库。
- 依赖审计：2026-10-23 执行 `npm audit --omit=dev --registry=https://registry.npmjs.org`，结果为 0 vulnerabilities；该结果不构成持续安全保证。
- 如新增依赖，请在此文件补充条目并确认许可证与本项目预期发布方式兼容。

> CallFlow 自身的代码与设计**尚未授予开源许可证**。详见 `LICENSE`。

## Runtime copyright notices

The following notices are reproduced for the runtime dependencies that may be
bundled into the production build. Each package's full license text is also
available in its installed `node_modules/<package>/LICENSE` file.

- **React / React DOM** — Copyright (c) Meta Platforms, Inc. and affiliates. MIT License.
- **React Router DOM** — Copyright (c) React Training LLC 2015-2019; Copyright (c) Remix Software Inc. 2020-2021; Copyright (c) Shopify Inc. 2022-2023. MIT License.
- **Express** — Copyright (c) 2009-2014 TJ Holowaychuk; Copyright (c) 2013-2014 Roman Shtylman; Copyright (c) 2014-2015 Douglas Christopher Wilson. MIT License.
- **Zod** — Copyright (c) 2025 Colin McDonnell. MIT License.
- **date-fns** — Copyright (c) 2021 Sasha Koss and Lesha Koss. MIT License.
- **lucide-react** — Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT); all other copyright (c) for Lucide are held by Lucide Contributors 2022. ISC License.

## Common license texts

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.

Apache-2.0 and other licenses for development-only tools (TypeScript,
Playwright-core, Vite and related packages) are included in the corresponding
installed packages; they are not part of the runtime bundle.
