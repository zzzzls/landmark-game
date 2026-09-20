# Rare UI：项目自建参考

来源：[Rare UI](https://www.rareui.com/)、[AI 文档目录](https://www.rareui.com/llms.txt)、[官方源码](https://github.com/swamimalode07/rare-ui)。核查日期 2026-09-20，仓库版本 `1214cfc8b19a456cbc8ea55c9aa04739a878e45c` 的完整树未发现 `SKILL.md`。本文件是项目自建指南，不冒充官方 skill。

该库提供 React、Tailwind 与 Motion 组件。它的玻璃、Apple 风格和弹簧效果不能成为本项目新视觉体系；先借鉴交互机制，再按像素 token 适配。

| 具体参考 | 项目应用 | 取舍 |
| --- | --- | --- |
| [Bounce Sidebar](https://rareui.com/components/bouncesidebar) | 管理员房间管理/我的答题切换 | 参考活动位置指示和状态连续性，保留直角与清晰像素边缘，收敛弹跳幅度 |
| [Hook Sidebar](https://rareui.com/components/hooksidebar) | 当前任务或步骤的选中状态 | 可参考轨道与当前项关联；手机仍直接展示三题，不新增占据地图空间的常驻导航 |
| [Folder component](https://rareui.com/components/foldercomponent) | 仅在确有展开收起需求的辅助信息区考虑 | 不把悬停展开用于必须读取的题目或成绩，不照搬 3D 倾斜和玻璃层 |

这些是候选参考，不是要求增加功能。落实前通过 AI 文档目录查当前组件页面、源码、依赖和安装标识；不能根据展示名猜 CLI slug。采用源码时下载完整文件与 helper，保留 MIT 许可与原作者署名，核查 React 18 兼容性，将所有依赖和资源本地打包。

禁用会模糊或滚动真实成绩的效果，不在地图上加 Fluid Orb、shader 或追随光标装饰；较强视觉效果如需采用必须有清楚用途且不牺牲移动端操作与性能。`prefers-reduced-motion` 下保留完整可操作的静态状态。
