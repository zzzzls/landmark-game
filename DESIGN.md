---
name: 北京地标盲猜
description: 米白、深墨与朱红构成的手机优先地图游戏界面
colors:
  paper: "#f6f3eb"
  surface: "#fffdf8"
  ink: "#252c2b"
  muted: "#656a65"
  line: "#deded3"
  accent: "#ae3e2b"
  accent-dark: "#8f2e20"
  accent-soft: "#f7e8df"
  green: "#326348"
  error: "#a22d27"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.55
  display:
    fontSize: "clamp(50px, 5.5vw, 78px)"
    fontWeight: 650
    lineHeight: 1.22
    letterSpacing: "-0.04em"
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
rounded:
  radius: "18px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "12px"
    padding: "13px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "12px"
    padding: "10px 16px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    padding: "6px 8px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "50%"
    padding: "10px"
    width: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "10px"
    padding: "13px 15px"
  room-tab-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent}"
    rounded: "7px"
  target-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "9px"
  entry-panel:
    backgroundColor: "{colors.surface}"
    rounded: "22px"
    padding: "32px"
---

# Design System: 北京地标盲猜

<!-- IMPLEMENTATION SNAPSHOT: extracted from src/styles.css, src/UI.jsx, src/Home.jsx, src/GameRoom.jsx and src/Screen.jsx. This document describes the implemented system; it is not runtime acceptance evidence. -->

## Overview

**Creative North Star: "城市记忆地图"**

米白底承托真实地图，深墨文字说明当前任务，朱红强调落点、选择与主操作。保持轻量、清楚的中文界面，让手机玩家随时知道正在猜什么、下一步按哪里；房主与现场大屏沿用同一套视觉语言。

本文记录当前实现。色彩与字体以 frontmatter 为提取基准，运行实现来源为 `src/styles.css`；组件内的固定尺寸并不表示已建立独立 CSS token。sidecar 的合成色阶仅供设计面板预览，不是应用中已有的色阶。

**Key Characteristics:**

- 米白表面、深墨文字、朱红动作重点。
- 真实无文字高德底图与清楚区分的猜测点、真实点。
- 手机底部任务面板、桌面侧栏、独立观众大屏。
- 短句、可触控按钮和可见的当前题与主操作。

## Colors

### Primary

`accent`（朱红）用于主按钮、选中状态、品牌图标与关键成绩；`accent-dark` 用于主按钮悬停和成绩文字，`accent-soft` 用于已选题目及成绩摘要。

### Neutral

`paper`（米白）是页面底色，`surface`（暖白）承托表单、面板和地图标签。`ink`（深墨）用于正文，`muted` 用于说明，`line` 分隔条目与容器。

状态色保留独立语义：`green` 表示已准备、成功及真实位置；`error` 用于失败信息。玩家身份颜色由运行数据提供，不将其归为品牌主色。

## Typography

全站使用系统中文无衬线字体栈，无外部字体依赖。首页大标题是主要展示字；手机宽度不超过 860px 时改为 47px，不超过 380px 时为 41px。

任务标题桌面 24px、手机 22px、窄手机 20px；手机高度不超过 650px 时使用 19px。正文以 frontmatter 的 body 为基准，表单输入为 16px，辅助说明通常 12–14px。房间号、排名、误差和题号使用等宽数字或明确字距；长地点名与昵称允许换行，不靠截断隐藏关键信息。

## Layout

首页桌面为介绍与入口两列，内容最大宽度 1080px；手机改为最大宽度 480px 的单列。入口表单维持完整标签和单一提交动作。

玩家与房主使用同一全屏地图工作区（100dvh）。宽度大于 860px 时，任务面板在左侧，宽 380px；手机使用贴底全宽面板，标题、题目切换与页脚操作不随正文滚走。展开面板最大高度 60dvh，收起为 48dvh；短手机分别为 68dvh、58dvh。正文独立滚动，收起后隐藏并退出交互。安全区通过现有 `--safe-t` / `--safe-b` 处理。

现场大屏有独立布局：右侧信息栏宽 `clamp(350px, 27vw, 490px)`，地图占据其余区域；窄屏信息栏转到底部，最大高度 52dvh。大屏的房间号、提交人数与排名字号更大，不直接放大玩家表单。

地图避让来自实际面板测量；组件传入 CSS 顺序的 padding，地图适配层转换为高德要求的顺序。面板尺寸调整须同步检查标记、标签和版权可见性。当前没有独立 spacing token 表，不从散落的 padding 反推虚构尺度。

## Elevation & Depth

页面主要靠表面色、边框和留白分层。`--shadow` 用于桌面任务面板、现场信息栏、对话框与 toast；手机底板使用向上的浅阴影。房主选中标签和地图说明使用更轻的局部阴影。准确阴影值记录在 sidecar，避免在正文重复 token。

动效仅反馈状态：按钮按压下移、地图预览针落下、成绩摘要出现、面板内容展开与提交进度变化。尊重 `prefers-reduced-motion`，启用时取消动画和过渡。

## Shapes

面板基准圆角是 `radius`。按钮采用紧凑圆角，输入框略小；手机底板只保留上方圆角。圆形只承担头像、状态点、题号和图标按钮；地图真实点用绿色空心环，猜测点用实心点，不能仅靠文字解释两者。

## Components

- **Buttons：** 主按钮承接当前明确动作，最小高度 50px；次按钮、文字按钮、图标按钮通常最小高度 44px。主按钮悬停变深，主次按钮按压下移 1px；键盘焦点有 3px 朱红描边与 3px 间隔。禁用按钮降低不透明度，并显示对应等待文案。
- **Inputs：** 暖白表面、细边框、持续可见的标签；聚焦时朱红边框与浅色焦点环。错误在字段附近以独立可读文案呈现，搜索分别显示加载、无结果与失败。
- **Navigation：** 首页入口用下划线表示选中；房主“房间管理 / 我的答题”用浅底分段导航。题目切换用数字和确认勾结合选中色，选中状态由 `aria-pressed` 表达。
- **Panels：** 入口容器使用边框与留白；地图上任务面板有标题、可滚动正文及固定操作区。手机收起的是详情，当前题与主操作继续可见。
- **Map markers：** 实心猜测点、绿色空心真实点、预览标签与误差连线承担游戏信息；高德底图隐藏地名，保留地图版权。这里只描述界面，不改变揭晓前后的数据隔离。
- **Dialogs and feedback：** 指引与提前揭晓确认使用原生 `dialog`；错误使用 alert，连接反馈与 toast 使用 status。成功反馈在服务端确认后出现，断线时操作禁用。

## Do's and Don'ts

### Do:

- Do 保留中文、当前题、下一步动作与明确等待状态。
- Do 用真实无文字高德地图，并保持版权与关键标记可见。
- Do 检查手机安全区、短屏、长名称、键盘焦点和减少动效偏好。
- Do 让玩家、房主和现场大屏共享色彩与组件语言，分别适配各自布局。

### Don't:

- Don't 用颜色作为选中、完成或失败的唯一信息。
- Don't 将主操作藏进折叠菜单，或让长内容挤掉操作区。
- Don't 在服务端确认前显示操作成功，或把缺失成绩显示为零。
- Don't 将本文、截图或组件预览当成真实地图及完整游戏流程验收。
