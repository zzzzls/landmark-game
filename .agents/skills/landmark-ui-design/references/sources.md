# 设计来源与安装记录

核查及安装日期：2026-09-20。所有技能均为项目内副本，没有修改用户级 skill、注册 MCP 服务或安装前端组件依赖。安装器为 Codex 内置 `skill-installer/scripts/install-skill-from-github.py`，指定 `--ref`、`--path`、`--dest .agents/skills`，taste 的目录使用 `--name` 与 frontmatter 名称对齐。

## 固定版本

| 本地技能 | 上游目录 | commit | 许可 |
| --- | --- | --- | --- |
| `beui` | [starc007/ui-components · skills/beui](https://github.com/starc007/ui-components/tree/90c29d7f80f661263f7b424629738e40a5a48db7/skills/beui) | `90c29d7f80f661263f7b424629738e40a5a48db7` | MIT，完整文本随技能保存 |
| `transitions-dev` | [Jakubantalik/transitions.dev · skills/transitions-dev](https://github.com/Jakubantalik/transitions.dev/tree/598d3d6ad89dabb4bdf742fd2e887ca53914a888/skills/transitions-dev) | `598d3d6ad89dabb4bdf742fd2e887ca53914a888` | 官方免费发布的 skill；该版本未发现独立 LICENSE，不推断为 MIT |
| `shadcn` | [shadcn-ui/ui · skills/shadcn](https://github.com/shadcn-ui/ui/tree/a87a63b2ca25143d26c8bd0903e4e9bc77b3f824/skills/shadcn) | `a87a63b2ca25143d26c8bd0903e4e9bc77b3f824` | MIT，完整文本随技能保存 |
| `design-taste-frontend` | [Leonxlnx/taste-skill · skills/taste-skill](https://github.com/Leonxlnx/taste-skill/tree/f41c71f8a01504265035b8a0551431965ce033cd/skills/taste-skill) | `f41c71f8a01504265035b8a0551431965ce033cd` | MIT，完整文本随技能保存；上游称此版为 v2 experimental |
| `redesign-existing-projects` | [Leonxlnx/taste-skill · skills/redesign-skill](https://github.com/Leonxlnx/taste-skill/tree/f41c71f8a01504265035b8a0551431965ce033cd/skills/redesign-skill) | `f41c71f8a01504265035b8a0551431965ce033cd` | MIT，完整文本随技能保存 |

机器可核对的版本、原始/本地 SKILL SHA-256、许可证来源与修改清单见 [upstream-lock.json](upstream-lock.json)。Transitions 保留了 32 个配套示例和公共 CSS token；没有安装 Pro 内容。复制配方或对外分发前需重新核对对应授权，不将免费入口描述为任何形式的完整版权授权。

## 最小兼容性调整

- `transitions-dev` 的原始 description 超过 skill validator 的 1024 字符上限；缩短为能力与触发范围摘要，正文、示例和 CSS 未改。
- `shadcn` 去掉 Claude 专用的 `user-invocable` 元数据，保留自动选择；将 `agents/openai.yml` 改为 Codex 使用的 `openai.yaml`，缩短 UI description，保留本地图标。其正文与规则文件未改。
- 其余上游技能正文与元数据保留原样。上游风格偏好与项目之间的适配放在项目入口和 `AGENTS.md` 中，不隐藏修改上游指令。

## 网站参考

- [Beautiful UI](https://www.beautifului.dev/)：官网未找到 skill 入口，`/llms.txt` 返回 404；以状态列表、搜索和像素加载示例为参考。官网 [MIT License](https://www.beautifului.dev/license)，作者 Shane Levine。没有复制整站或页面素材，适配内容见 [beautiful-ui.md](beautiful-ui.md)。
- [Rare UI](https://www.rareui.com/)：其 [llms.txt](https://www.rareui.com/llms.txt) 指向 [swamimalode07/rare-ui](https://github.com/swamimalode07/rare-ui)，核查 commit `1214cfc8b19a456cbc8ea55c9aa04739a878e45c` 的完整树未发现 SKILL.md。MIT，Copyright (c) 2026 Swami Malode。项目原创指南见 [rare-ui.md](rare-ui.md)，尚未引入组件源码。

## 刷新方法

仅在任务需要更新技能或引入新组件时重新核查官网与仓库；先比较版本和变更，再更新项目副本、引用、许可证和锁记录，保留本项目适配规则。不要无提示执行 upstream 更新脚本、安装全局插件或批量替换项目组件。下载依赖与开发资料允许联网，游戏运行时不得依赖这些网站。
