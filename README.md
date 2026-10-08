<div align="center">

**简体中文** | [English](README.en.md)

# dsh-superpowers-preset

把 [obra/superpowers](https://github.com/obra/superpowers) 的完整开发方法论，
做成一个 **DeepSeek Harness (DSH) Agent 预设**。

按需选择、按任务生效：流程约定进系统提示词，技能目录只在这个模式里可见。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--alpha.1-informational)](#兼容性)
[![Upstream](https://img.shields.io/badge/upstream-obra%2Fsuperpowers%20v6.4.2-lightgrey)](https://github.com/obra/superpowers)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](package.json)

![在新建任务时选择 Superpowers 模式](static/preset-picker.png)

</div>

---

## 它解决什么问题

把 Superpowers 作为**插件**装进 DSH，技能会注册到 host 层，于是**每一个**会话
——包括跟编码无关的、用别的工作流的——系统提示词里都会多出这份技能目录。这既
是 token 开销，也可能和其他工作流打架。

这个项目换了一条路：把 Superpowers 做成 **Agent 预设**（也就是 DSH 界面里的
「模式」）。

| | 插件模式 | 本预设 |
| --- | --- | --- |
| 谁能看到这些技能 | profile 里所有会话 | 只在这个模式里启动的任务 |
| 没用上时的技能目录 token | 每个会话都要付 | 0 |
| 流程约定怎么进模型 | 取决于插件（会话开始时注入，或只靠技能描述） | 本模式的系统提示词，每次请求都重新发送 |
| 上下文压缩之后 | 会话开头注入的内容可能被裁掉 | 不受影响：系统提示词不在会话历史里 |
| 怎么关掉 | 停用/卸载插件并重启 | 新建任务时选别的模式 |

两种方式回答的是不同的问题，没有优劣之分，取舍详见
[与插件模式的对比](docs/plugin-vs-preset.md)。

## 安装

> **先澄清一个用词。** DSH 里的 `dsh plugin add` 是**安装通道**，它装进去的东西
> 叫 **bundle**——一个带 `dsh.bundle.patch` 的普通 npm 包。bundle 装完之后运行成
> 什么形态，完全由它那份 patch 的内容决定。
>
> 本包只往 profile 的组合里插了**一行 agent-preset 声明**，没有把任何东西挂到
> host 层。所以准确说法是"**用插件通道安装的预设**"，而不是"插件"。这个包自己写
> 的代码只有一个 `lib/skills.js`，它作为预设的**子行**被挂载，因此注册进的是预设
> 自己的技能层。为什么要这样做，见[工作原理](#工作原理)。

### 方式一：让 DSH 自己装（最省事）

在 DSH 里新建对话，把这句话发给它：

```
帮我安装这个插件：https://github.com/EdouardRichard/superpowers-preset-dsh
```

它会调用 `dsh plugin ... add` 完成安装并验证组合。**但它不能替你重启 profile**
——重启会终止它自己所在的会话。所以装完你要手动重启并刷新浏览器。

> 前提：Agent 能找到一个可用的 `dsh`。如果你的 `dsh` 没有加到 `PATH`，
> 把下面方式二里的完整命令直接发给它更稳妥。

### 方式二：命令行

```sh
# 从 GitHub 安装
dsh plugin --profile web add github:EdouardRichard/superpowers-preset-dsh
```

`dsh` 没有在 `PATH` 里时，用 `npx` 跑同一个 CLI：

```sh
npx --yes @deepseek-ai/dsh plugin --profile web add github:EdouardRichard/superpowers-preset-dsh
```

> ⚠️ `npx` 默认取 npm 的 `latest` 标签，它可能**落后于**你正在运行的
> harness（例如 npm 上 `latest = 0.2.0-rc.2`，而你在跑 `0.2.1-alpha.1`）。
> 版本对不上时显式指定，例如
> `npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin ...`。
> 用 pnpm 的话，`pnpm dlx @deepseek-ai/dsh@<版本> plugin ...` 等价。

`--profile` 换成你实际用的 profile（`web` / `headless` / 自定义）。profile 不存在时
会被自动初始化。

### 方式三：从本地目录安装

```sh
git clone https://github.com/EdouardRichard/superpowers-preset-dsh
dsh plugin --profile web add ./superpowers-preset-dsh
```

相对路径按**你执行命令时所在的目录**解析，安装后记为该目录的绝对 link。本地目录是
**link 安装**（不是复制），改完这个目录重启 profile 就生效，方便自己改。

### 装完要重启

bundle 层在 profile 启动时挂载，所以要**重启 profile**（关掉再跑一次
`dsh web`），然后刷新浏览器。

### 验证装好了

```sh
dsh --profile web --dump-config | Select-String superpowers-preset-dsh
```

输出里应该能看到 `- id: preset-superpowers` 这一段，以及
`name: superpowers-preset-dsh/skills` 这一行。看到这两行说明层已经组合进
profile；重启后新建任务时就能在模式列表里选到「Superpowers」。

### 卸载

```sh
dsh plugin --profile web remove superpowers-preset-dsh
```

卸载同样需要重启 profile。

## 使用

新建任务，在输入框上方把模式切到 **Superpowers**，然后正常描述任务即可。

- **不用记技能名**：Agent 会按规则自己加载。规则是"只要有技能明显适用，
  就先用 `skill` 工具把它加载进来再动手"。
- **可以点名**：输入 `/brainstorming`、`/writing-plans`、`/test-driven-development`
  这样的斜杠命令，或直接说"用 TDD 做"。
- **随时切回来**：这个模式只影响当前任务，下个任务选标准模式即可。

## 模式说明 / 如何使用

DSH 内置的四个预设（标准 / PTC / 极简 / 创造）卡片上有「模式说明」和
「如何使用」两个按钮。**第三方预设拿不到这两个按钮**——这是 DSH 当前的实现
决定的，不是配置问题：帮助内容的查找只对 `trust === 'system'` 的内置预设开放，
而且只有 id 在写死的四个值里才会命中（见
[证据与说明](docs/guide.zh.md#三为什么卡片上没有那两个按钮)）。

所以这两块内容放在了文档里，并且随包分发：

- **[模式说明与如何使用（中文）](docs/guide.zh.md)**
- **[Mode details and how to use (English)](docs/guide.en.md)**

下面是精简版。

### 模式说明（精简）

**工作方式**：Superpowers 的 15 个技能被注册进这个预设自己的技能层，
`using-superpowers` 的正文作为本模式的 persona 进入系统提示词。计划模式、
子 Agent、工作流、目标、上下文压缩、终端、文件读写检索都在，所以这个模式
可以独立完成从想法到提交的全过程。

**五个阶段**：想清楚（`brainstorming`）→ 写计划（`writing-plans`）→
执行（`subagent-driven-development` / `executing-plans`）→
排障（`systematic-debugging` / `test-driven-development`）→
收尾（`verification-before-completion` / `requesting-code-review` /
`finishing-a-development-branch`）。

**什么时候选**：要交付代码的功能开发、缺陷修复、重构；希望 Agent 先把需求和
设计谈清楚；任务长到需要计划和台账。

**什么时候别选**：和编码无关的问答与资料整理（用标准模式，省 token）；
只想快速改一行；需要实验对照基线（用极简模式）。

### 如何使用（精简）

选好模式，直接描述任务。例如：

> 我想给这个 CLI 加一个「导出为 CSV」的功能，但还没想清楚参数怎么设计。先跟我把需求和边界聊清楚，给我两三个方案对比，我确认之后再写代码。

> 提交订单后偶尔会出现重复扣款。先定位根因，别急着改；找到之后先写一个能复现的失败测试，再修，最后跑相关测试并说明原因。

> 审查我这次分支的改动，重点看潜在 bug 和测试缺口，指出文件与行号。先不要改文件。

每个例子都写清了**预期产出**，完整的六组示例见
[如何使用](docs/guide.zh.md#二如何使用)。

## 技能列表

技能内容同步自上游 **obra/superpowers v6.4.2**，并按 DSH 重写了涉及工具、
路径、子 Agent 与脚本调用的说明。

| 技能 | 用途 |
| --- | --- |
| `using-superpowers` | 入口：怎么找技能、什么时候必须加载 |
| `brainstorming` | 通过协作对话把想法变成你确认过的设计 |
| `writing-plans` | 把规格拆成可独立验证的小任务 |
| `executing-plans` | 在当前上下文里按台账执行计划，末尾一次整分支评审 |
| `subagent-driven-development` | 每个任务派发全新实现者 + 独立评审者 |
| `dispatching-parallel-agents` | 把互不相关的任务并行扇出 |
| `systematic-debugging` | 先找根因再改的四阶段纪律 |
| `test-driven-development` | RED-GREEN-REFACTOR 实施循环 |
| `verification-before-completion` | 声称完成前先拿证据 |
| `requesting-code-review` | 合并前获得严格评审 |
| `receiving-code-review` | 核实反馈，而不是盲目照做 |
| `finishing-a-development-branch` | 安全地整合已完成的工作 |
| `using-git-worktrees` | 功能开发的隔离工作区 |
| `writing-skills` | 以 TDD 方式编写并验证新技能 |
| `diagnosing-superpowers` | 读磁盘上的会话记录，用 `文件:行号` 取证复盘 |

## 工作原理

一句话：`cordis.patch.yml` 往 profile 的组合里插入**一行** agent-preset
声明；这一行里挂的 skill provider 是 `superpowers-preset-dsh/skills`，所以它
注册进的是**这个预设自己的作用域**，而不是 host 全局层。

```
cordis.patch.yml
└── preset-superpowers  (@deepseek-ai/dsh-agent-preset)
    ├── persona                                 ← using-superpowers 正文进系统提示词
    ├── superpowers-preset-dsh/skills           ← 15 个技能，只注册进本预设层
    ├── skill-filesystem                        ← 本地技能：项目 / 用户 / bundled
    ├── tool-skill                              ← 技能目录 + skill 工具
    └── 其余全部照抄官方「标准模式」的那份清单
```

### 它就是「标准模式 + Superpowers」

**这一点是有保证的，不是大概齐。** DSH 会把一些实际可用的行在 host 层禁用，
改由每个预设自己挂载——最典型的是 `skill-filesystem`：官方补丁里写得很清楚，
"presets own local discovery"（`packages/bundle/web-app/cordis.patch.yml:493-503`）。
预设如果忘了挂它，就**没有本地技能发现**：项目里的 `.dsh/skills`、`.agents/skills`
和用户目录的 `$DSH_HOME/skills` 全部看不见，而且不会报错。

所以这里做了三重保障：

1. **清单是镜像来的，不是手写的。**
   `npm run sync:preset -- <dsh 源码目录>` 直接从官方 `standard` 预设重建插件清单，
   只保留本包自己的两行（persona 和 Superpowers provider），其余逐字节照抄。
2. **提交了快照，卡在构建上。** `preset/standard-parity.json` 记录官方预设携带的
   每一行，并对每个顶层行块做 sha256；`npm run verify` 一旦发现少一行、或者某个
   镜像行的 config / isolate / disabled / 嵌套子行被改过，就失败。
3. **persona 身份行也被断言**：官方预设改了身份行或 working-directory 后缀，
   `sync:preset` 会报错，而不是悄悄用旧身份继续发布。

升级 DSH 后重跑 `npm run sync:preset -- <path> --check`（只报告不改动），再
`npm run verify`。

### 与标准预设相比，有三处固有差异

这三处来自「本预设不是 DSH 内置预设」这个身份，任何插件都改不了：

| 方面 | 标准模式 | 本模式 |
| --- | --- | --- |
| 分组 | 内置 | 自定义（`isBuiltInPreset` 只认不发布 `name` 且 id 在内置四个里的行） |
| 名称/描述 | 随界面语言本地化 | 声明里的字面量，不随语言变化 |
| 新任务默认 | 是 | 否——要在新建任务时手动选，或在设置里「设为新任务默认」 |

另外两点行为差异：

- **同名技能时本地技能优先。** 本包和 `skill-filesystem` 注册进同一层，层内按
  rank 决定胜负（本地根 100–500，本包 550，bundled 600，数值小的赢），所以你
  自己写的同名技能会盖掉打包的那份，DSH 会记一条 warning。
- **提示词更大，但只在本模式。** 开发机上实测：system prompt 6130 → 9878 字符，
  技能目录 2559 → 8356 字符。

完整说明（包括为什么 bootstrap 用 persona 而不是会话开始时的注入、为什么
provider 用子路径导出而不是包根）见 [docs/architecture.md](docs/architecture.md)。

## 自定义

这个预设的每一行都可以被你自己的 profile patch 覆盖。例如改显示名、让它排在
别的模式前面，或者拿掉你不想要的工具：

```yaml
# 追加到 $DSH_HOME/profiles/<你的 profile>/cordis.patch.yml
- id: preset-superpowers
  name: '@deepseek-ai/dsh-agent-preset'
  config:
    id: superpowers
    name: 超能力模式
    description: 我的自定义描述。
    order: 2
    plugins:
      # config 是整体替换，不是深合并：把上面 cordis.patch.yml 里那份
      # plugins 列表原样抄过来，再按你的想法增删。
      - id: persona
        name: '@deepseek-ai/dsh-persona'
        config:
          prefix: |-
            ...同样原样保留，或者换成你自己的…
          suffix: Your working directory is {{cwd}}.
      # ...
```

一个可以直接抄的骨架见
[examples/profile-override.patch.yml](examples/profile-override.patch.yml)。

## 上游同步

`skills/` 是**生成产物**，不要手改。同步逻辑全部写在脚本里，每条改写都带断言：

```sh
# 1. 取上游对应版本的源码
mkdir -p .upstream && curl -L \
  https://codeload.github.com/obra/superpowers/tar.gz/refs/tags/v6.4.2 \
  | tar -xz -C .upstream --strip-components=1

# 2. 重放移植（会顺带重新生成 cordis.patch.yml 里的 persona 正文）
npm run sync -- .upstream

# 3. 校验
npm run verify
```

上游一旦改了脚本依赖的原文，`npm run sync` 会**直接报错并保持 `skills/`
不变**，而不是静默丢掉某条 DSH 适配。适配清单见 [NOTICE.md](NOTICE.md)。

## 兼容性

| 项目 | 状态 |
| --- | --- |
| 验证过的 DSH 版本 | `0.2.1-alpha.1`（安装版）与源码 checkout `5badb15` |
| 依赖的 DSH 接口 | `ctx.skills.registerProvider`（技能提供者注册）、`dsh.bundle.patch`（bundle 挂载）、`@deepseek-ai/dsh-agent-preset` 声明格式、`@deepseek-ai/dsh-persona` |
| 运行时依赖 | **无**。只使用 Node 内置模块 |
| peerDependencies | **不声明**。DSH 的插件兼容闸门只检查插件自己声明的 peer 依赖，因此这道闸门不会拦截本包——代价是 DSH 也不会替你校验版本，所以升级 DSH 后请重跑 `npm run verify` |
| Node.js | >= 20（本机在 24.x 上验证） |
| 平台 | Windows / macOS / Linux。Windows 上 `tool-pwsh` 生效，POSIX 上 `tool-bash` 生效 |

### 已知限制

- **卡片上没有「模式说明 / 如何使用」按钮**，原因见上文；等价内容在
  [docs/guide.zh.md](docs/guide.zh.md)。
- **子 Agent 无法指定模型**：DSH 的 `subagent` 工具只接受
  `description` / `prompt` / `run_in_background`。`subagent-driven-development`
  里"显式指定模型"的要求，在 DSH 上只能写进 prompt；确实需要按单元指定模型时
  改用 `workflow`（它的 `agent()` 接受 `provider` / `model`）。
- **没有命名 Agent**：上游的 `Task(superpowers:code-reviewer)` 在 DSH 里不存在，
  改为把技能自带的提示词模板（`code-reviewer.md` 等）交给 `subagent`。
- **bash 辅助脚本**：技能里 7 个 `.sh` 脚本需要 Git Bash。Windows 上 `PATH` 里的
  `bash` 往往是 `WindowsApps\bash.exe`（0 字节的 WSL 存根），不是 Git Bash；
  脚本调用前先 `Get-Command bash -All` 确认。`node` 脚本不受影响。
- **`writing-skills/render-graphs.js` 需要 graphviz 的 `dot`**，没装就跳过渲染。

## 验证

不需要安装就能跑的静态校验（CI 跑的也是它）：

```sh
npm run verify
```

它检查 bundle 清单能解析、预设声明合法、provider 只挂在预设作用域、官方
标准预设携带的每一行都还在、persona 正文与技能文件一致、15 个技能都能通过
真实 provider 列出并读回，以及没有悬空相对链接。

装进真实 profile 的端到端验证：

```sh
# 用一个一次性 profile，不要动你自己的
dsh --profile sptest --from-default-profile web --dump-config > $null
dsh plugin --profile sptest add ./superpowers-preset-dsh
dsh --profile sptest --port 3099 --no-open
```

然后在界面里分别用 **Superpowers** 和 **标准模式** 各起一个任务，对比会话记录：

- Superpowers 任务的系统提示词里有 `using-superpowers` 的正文，技能目录里有
  这 15 个技能；
- 标准模式任务的系统提示词里没有它，技能目录里也没有它们。

## 许可证与致谢

MIT。技能内容改编自 [obra/superpowers](https://github.com/obra/superpowers)
（MIT，© 2025 Jesse Vincent），完整的第三方声明、上游许可证原文与改编清单见
[NOTICE.md](NOTICE.md)。

上游项目、DSH、以及先行把 Superpowers 移植到 DSH 的
[superpowers-dsh](https://github.com/LayneChai/superpowers-dsh) 都值得一看。
本项目与它们没有隶属关系。
