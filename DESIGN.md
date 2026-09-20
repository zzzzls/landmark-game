---
name: 北京地标盲猜
description: 浅天空蓝、奶白、金黄与原创像素图形构成的手机优先北京地图街机
colors:
  paper: "#eef4f6"
  surface: "#fffdf5"
  ink: "#202d44"
  muted: "#57657b"
  line: "#b0bfd0"
  accent: "#f5bf36"
  accent-dark: "#ffd76b"
  accent-soft: "#fff1bf"
  green: "#16735d"
  error: "#b53b35"
  coral: "#f27c68"
  accent-ink: "#795409"
  input-bg: "#ffffff"
  result-bg: "#fff5ce"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.55
  display:
    fontSize: "clamp(42px, 5vw, 68px)"
    fontWeight: 850
    lineHeight: 1.25
    letterSpacing: "0"
  task-title:
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.32
    letterSpacing: "-0.025em"
  section-title:
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.3
  label:
    fontSize: "14px"
    fontWeight: 550
  digits:
    fontFamily: '"Beijing Pixel Digits", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
rounded:
  radius: "0"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius}"
    padding: "13px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius}"
    padding: "10px 16px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "6px 8px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.radius}"
    padding: "10px"
    width: "44px"
  input:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius}"
    padding: "13px 15px"
  room-tab-selected:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.accent}"
    rounded: "{rounded.radius}"
  target-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius}"
  entry-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.radius}"
    padding: "32px"
  result-summary:
    backgroundColor: "{colors.result-bg}"
    rounded: "{rounded.radius}"
    padding: "20px 16px 0"
---

# Design System: 北京地标盲猜

<!-- IMPLEMENTATION SNAPSHOT: src/styles.css, src/UI.jsx, src/PixelArt.jsx, src/Home.jsx, src/GameRoom.jsx, src/Screen.jsx and src/Results.jsx. Descriptive design documentation, not runtime acceptance evidence. -->

## Overview

**Creative North Star: "像素北京街机"**

浅天空蓝界面与奶白面板承托真实地图，深海军蓝中文保证可读，金黄指向当前操作与关键成绩。北京城楼天际线、像素表情和方形关卡按钮带来轻松的街机感；正文保持清楚、直接，不把整个地图或中文强行像素化。

本文记录当前实现。frontmatter 提取运行中的色彩与组件值，sidecar 保存阴影、动效和自包含组件示例；实际样式以 `src/styles.css` 为准。

**Key Characteristics:**

- 浅蓝奶白表面、金黄动作、薄荷绿完成状态，原创 SVG 像素图形。
- 手机底部任务面板、桌面侧栏、独立横屏大屏。
- 当前题、确认位置和下一步始终可见。
- 提交即看个人成绩，全场揭晓才出现最终排名。

## Colors

### Primary

`accent` 为金黄，承接主按钮、题目选中和关键成绩；`accent-dark` 是较亮的悬停色，保留既有 token 名。黄色按钮使用深海军蓝文字。`accent-soft` 表示低强度强调表面。小字号强调文字使用 `accent-ink` 棕金色，避免黄色文字落在浅底上对比不足。

### Secondary

`green` 表示准备完成、确认成功及真实位置；`coral` 用于像素表情腮红和城楼。`error` 搭配浅红错误背景与深红文字说明，不能只靠颜色传达失败。

### Neutral

`paper` 为浅天空蓝背景，`surface` 为面板表面，`ink` 为深海军蓝正文，`muted` 为辅助说明，`line` 为分隔和描边。输入与成绩摘要使用白色与浅金色局部表面。玩家身份色来自房间数据，不属于品牌主色。

## Typography

中文继续使用系统无衬线字体。首页桌面标题为 `clamp(42px, 5vw, 68px)`，手机为 `clamp(36px, 10vw, 47px)`；字重 850、行高 1.25。任务标题桌面 24px、手机 22px、窄屏 20px、短屏 19px。紧凑答题题名使用22px（≤380px为20px），不随短屏缩小。输入文字 16px，正文 15px，辅助说明通常 12–14px。

本地原创 `src/assets/pixel-digits.ttf` 提供 `Beijing Pixel Digits`，仅覆盖数字及 `-./`，用于首页规则计数、题号、房间号、总误差和排名；其余字符回退系统字体，不需要外部字体服务。长昵称与地点名允许换行，不能通过截断隐藏三题内容。

## Layout

三个固定入口分别是 `/` 玩家、`/admin` 管理员、`/screen` 大屏。等待页桌面内容最大宽度 1100px，介绍与操作区按 1.25:0.85 分栏；手机为最大 480px 单列。没有房间时明确等待，首次玩家仅填写昵称，不出现房间号或建房表单。

游戏工作区为 100dvh。大于 860px 时左侧任务面板宽 380px；手机改为全宽贴底面板，标题、关卡选择和页脚操作不随正文滚动。展开高度通常不超过 60dvh，收起不超过 48dvh；短屏分别为 68dvh 与 58dvh。保留安全区与独立滚动，地图避让按实际面板尺寸测量。

手机参赛作答使用独立紧凑底板：三题切换与“已确认 N/3”同一行，题名固定两行高度（56px，超长内容在题名内滚动），底部52px操作区在预览、已保存和提交之间保持稳定。普通玩家标准高度205px，短屏193px，另加一次底部安全区；管理员角色切换另占54px。此阶段不提供展开箭头，不显示原有说明正文。当前题使用浅金底/棕金描边，已确认用绿色勾，金黄实色留给确认/提交。桌面继续使用原侧栏排布，其他阶段沿用上述展开/收起面板。

大屏大厅与作答阶段沿用右侧信息栏。揭晓时右侧为 `calc(60% - 24px)`，左侧地图约四成；成绩每页最多六人，每人一行明确列出三个地点及误差。十秒自动翻页，悬停或聚焦暂缓，并有手动翻页、暂停与继续；手机大屏页改为底部最多 60dvh 面板。

## Elevation & Depth

像素主题使用硬阴影与清晰边框。主按钮 `0 4px 0 #b18a38`，按压下移 3px 并缩减阴影；桌面面板 `6px 6px 0 #b9c9d6`，入口与对话框可达 8px。手机底板用 `0 -5px 0 #b9c9d6` 与顶部描边区分地图。

短动效用于按钮、预览落针、面板展开及提交进度。结算保留一次性的路线描画、方形勋章落下和八粒黄色/薄荷色像素粒子；成绩从首帧显示真实值，不从零累加，也不遮罩隐藏数字。庆祝窗口为 1400ms，按房间/玩家在 sessionStorage 中去重；未提交或旁观者不庆祝。最终名次仅在全局揭晓后出现。`prefers-reduced-motion` 关闭动画及过渡。

## Shapes

所有组件统一直角，边框通常 1–2px，选择与任务槽使用明确描边；原创 SVG 的阶梯边缘承担像素特征。地图猜测点为实心菱形，真实点为薄荷绿边框菱形，配合文字和连线区分。界面控件使用原创像素图标；地图上的公共知名地标可使用指定 emoji 作为独立参考针，不代表题目答案。

## Components

- **Buttons：** 主操作最小高度 50px，其他主要触控目标至少 44px；焦点使用 3px 明黄外框，禁用不透明度 .55 并保留原因文案。
- **Inputs：** 白色输入表面、2px 边框、持续可见标签；聚焦明黄描边与硬阴影。搜索区分加载、无结果、请求失败。
- **Navigation：** 管理员在同一身份连接中切换管理与答题；选中标签用黄线。三道题是方形关卡按钮，数字、确认勾与 `aria-pressed` 共同表达状态，另提供可读的已确认/未确认说明。答题确认请求中，切题、取消、地图落点及管理员角色切换暂时禁用，服务端确认后才更新进度并选择下一道未完成题。
- **Pixel art：** `UI.jsx` 的 Icon 为 24×24 原创像素 SVG；`PixelArt.jsx` 提供北京城楼天际线及 happy/waiting 像素表情。图形使用 `shapeRendering="crispEdges"`，装饰性图形对辅助技术隐藏。
- **Results：** 个人通关面板显示真实总误差、最佳地点和逐题连线。提交后先显示“最终排名待公布”；揭晓后才显示排名。普通玩家等待下一局，只有管理员可重开；重开后所有在线入口自动换房，保留昵称并重新出题。
- **Screen results：** 每行使用玩家 ID 作为稳定标识，显示排名、昵称、总误差和三个地点各自误差。未提交者不计分，无题旁观者显示未参与；不显示虚假零分。
- **Map：** 使用真实无文字高德地图，保留版权标识，地图本身不做像素滤镜。视图重排后重新测量避让，避免标签落在面板后。
- **Feedback：** 原生 dialog 提供指引和提前揭晓确认。连接中、重连、失败与无房间等待分开呈现；成功反馈必须以服务端状态为准。

## Do's and Don'ts

### Do:

- Do 保持中文可读、触控区域足够、当前题与主操作可见。
- Do 使用本地像素资源，保留真实地图与安全区适配。
- Do 对长名称、短屏、软键盘和减少动态效果做实际验证。
- Do 将个人成绩与全场排名严格区分，跟随服务端确认状态。

### Don't:

- Don't 将暗色主题、旧朱红票据或系统 emoji 混回界面组件；地图公共参考点可使用明确指定的 emoji。
- Don't 在普通玩家入口提供建房和重开操作。
- Don't 提前暴露其他玩家的成绩与真点，或将缺失成绩显示为零。
- Don't 将设计文档或截图当作真实地图、30 人并发与完整流程验收。
