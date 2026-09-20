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
  result-bg: "#fff7d9"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.55
  display:
    fontSize: "clamp(52px, 5.7vw, 82px)"
    fontWeight: 900
    lineHeight: 1.16
    letterSpacing: "-0.045em"
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
    padding: "0 28px"
  result-summary:
    backgroundColor: "{colors.result-bg}"
    rounded: "{rounded.radius}"
    padding: "0 16px"
---

# Design System: 北京地标盲猜

<!-- IMPLEMENTATION SNAPSHOT: src/styles.css, src/arcade.css, src/map-game.css, src/UI.jsx, src/PixelArt.jsx, src/Home.jsx, src/Invite.jsx, src/GameRoom.jsx, src/Screen.jsx and src/Results.jsx. Descriptive design documentation, not runtime acceptance evidence. -->

## Overview

**Creative North Star: "像素北京街机"**

浅天空蓝界面与奶白面板承托真实地图，深海军蓝中文保证可读，金黄指向当前操作与关键成绩。北京城楼天际线、像素表情和方形关卡按钮带来轻松的街机感；正文保持清楚、直接，不把整个地图或中文强行像素化。

本文记录当前实现。基础 token 与组件值保留于 `src/styles.css`，`src/arcade.css` 在其后加载，定义城市挑战券的构图、层次和响应式覆盖；`src/map-game.css` 最后加载，定义地图悬浮任务与独立成绩布局；实际样式以最终级联为准。入口是挑战券、三题是关卡、成绩是战绩票；定位针角色和原创北京城景贯穿入口与少人数大屏。

**Key Characteristics:**

- 浅蓝奶白表面、金黄动作、薄荷绿完成状态，原创 SVG 像素图形。
- 出题/答题全幅地图与顶部浮层；管理/旁观使用面板；独立横屏大屏。
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

中文继续使用系统无衬线字体。首页桌面标题为 `clamp(52px, 5.7vw, 82px)`，手机为 `clamp(39px, 10.8vw, 48px)`，字重900；桌面行高1.16、手机1.08。手机短屏标题34px，城景隐藏以给表单留空间。任务标题桌面24px、手机22px；悬浮题签题名15px（≤380px为14px），允许内部滚动，不随短屏缩小。输入文字16px，正文15px。战绩总误差使用30–40px像素数字，单位用13px系统字体，名次数字34px。

本地原创 `src/assets/pixel-digits.ttf` 提供 `Beijing Pixel Digits`，仅覆盖数字及 `-./`，用于首页规则计数、题号、房间号、总误差和排名；其余字符回退系统字体，不需要外部字体服务。长昵称与地点名允许换行，极长题名在题签内滚动，不能通过截断隐藏三题内容。

## Layout

三个固定入口分别是 `/` 玩家、`/admin` 管理员、`/screen` 大屏。等待页桌面内容最大宽度1160px，标题城景与入场券按1.35:0.85分栏；手机为最大480px单列。入场券含昵称、主操作与底部玩法票根。没有房间时明确等待，首次玩家仅填写昵称，不出现房间号或建房表单。

游戏工作区随 visualViewport 可见高度更新（默认 100dvh）。出题和答题不再使用底部任务面板/桌面侧栏：顶部搜索框/三个题签悬浮在地图上，最大宽520px，手机两侧16px。管理员角色切换合并进56px轻量顶栏；管理与旁观进度继续使用原侧栏/底板。

出题搜索最多三条半透明奶白结果，外层透明，结果间距2px；已贡献地点是两枚紧凑标签。答题三枚题签横排，标准高度78px、短屏72px，长名称在题签内换行/滚动；浅金底色与3px金黄底线表示选中，底线以200ms平移。已确认绿色勾以220ms出现。落点旁同一轻量操作条内的两枚44px ✅/❌ 为明确允许的 emoji 操作按钮，180ms展开，右侧空间不足时翻左；地图拖动/缩放实时投影锚点，空白区域可操作地图。第三题确认后自动提交，不保留正常流程的手动提交按钮，只有失败/中断后保留显式重试。

个人成绩改为可滚动页面，桌面最大宽1040px的成绩/地图双栏，手机单栏。本人最小服务端距离误差题自动展示真实高德只读小地图；地图失败仅显示局部重试，分数不受影响。同分按题目顺序，0米是有效值，未提交/旁观不展示最准题。点击缩略图或明细进入全幅地图，顶部切题并提供返回成绩。缩略图无拖动缩放，保留版权，猜测与真点同坐标时用重叠内点/外环和错开的标签区分。

大屏大厅与作答阶段右侧宽度为 `clamp(480px, 43vw, 780px)`，大厅展示扫码入场、真实人数和双列玩家阵列，作答展示提交进度。揭晓时右侧为 `calc(60% - 24px)`（861–1400px为64%），左侧保留真实地图。三人以内采用舒展行高与底部城景；多人使用紧凑头名区，1920×1080下六人成绩与翻页控件同屏。每人明确列出三个地点及误差，十秒自动翻页，悬停或聚焦暂缓，并有手动翻页、暂停与继续；手机大屏页改为底部最多60dvh面板。

## Elevation & Depth

入口、管理面板与大屏使用硬阴影与清晰边框；地图操作控件使用细浅描边和轻微投影，避免每个元素争夺注意。主按钮 `0 4px 0 #b18a38`，按压下移 3px 并缩减阴影；桌面面板 `6px 6px 0 #b9c9d6`，入口与对话框可达 8px。手机底板用 `0 -5px 0 #b9c9d6` 与顶部描边区分地图。

城市挑战券在入口和大屏使用海军蓝描边与硬阴影，入口标题的金黄招牌形成主视觉。个人成绩将总误差与最准地图合并为单一奶白表面，删除深色票头、嵌套描边与重复总结；逐题明细使用细分隔线，名次保留轻量薄荷绿落印；头名在深海军蓝展示区中使用奶白姓名和金黄成绩。辅助列表保留轻描边，真实地图不添加背景纹理或装饰性动效。

短动效用于按钮、搜索结果180ms依次入场（间隔40ms）、预览落针/确认浮层180ms、题签切换200ms、确认220ms和成绩卡320ms入场。参考项目 transitions-dev 的 dropdown/tabs 模式，适配像素直角与无模糊的 CSS transform/opacity。结算保留一次性的方形勋章落下和八粒黄色/薄荷色像素粒子；成绩从首帧显示真实值，不从零累加，也不遮罩隐藏数字。庆祝窗口为 1400ms，按房间/玩家在 sessionStorage 中去重；未提交或旁观者不庆祝。最终名次仅在全局揭晓后出现。`prefers-reduced-motion` 关闭动画及过渡。

## Shapes

所有组件统一直角，边框通常 1–2px；地图工具采用1px浅描边，题签共享分隔线而非三个厚框；原创 SVG 的阶梯边缘承担像素特征。地图猜测点为实心菱形，真实点为薄荷绿边框菱形，配合文字和连线区分。界面控件使用原创像素图标；地图公共地标使用指定 emoji 作为独立参考针；落点确认/取消明确使用 ✅/❌。

## Components

- **Buttons：** 主操作最小高度 50px，其他主要触控目标至少 44px；焦点使用 3px 明黄外框，禁用不透明度 .55 并保留原因文案。
- **Inputs：** 入口表单保留白色表面、2px边框和可见标签；地图搜索使用单行50px细描边输入，标签对辅助技术可读，聚焦金黄底线，计数位于同一行。搜索区分加载、无结果、请求失败。
- **Navigation：** 管理员在同一身份连接中切换管理与答题；选中标签用黄线。三道题是顶部悬浮的地点题签，题号、地点名、确认勾与 `aria-pressed` 共同表达状态，另提供可读的已确认/未确认说明。答题确认请求中，切题、取消、地图落点及管理员角色切换暂时禁用，服务端确认后才更新进度并选择下一道未完成题。
- **Pixel art：** `UI.jsx` 的 Icon 为24×24原创像素SVG；`PixelArt.jsx` 的 `PixelCity` 绘制城楼、胡同与现代建筑，`PixelGuide` 是定位针角色。图形使用 `shapeRendering="crispEdges"`，装饰性图形对辅助技术隐藏。
- **Invite：** 管理员与大屏大厅复用本地二维码，使用npm依赖 `qrcode-generator`（版本由lockfile锁定）生成SVG，并保留四模块白色静区。当前可访问来源优先，localhost来源使用 `/api/lan` 的普通局域网地址；多地址可选、缺失可重试。生成二维码无需访问任何外部图像服务。
- **Task feedback：** 三枚题签的金黄底线以200ms移动；服务端确认后的勾选以220ms短暂缩放。减少动态效果模式关闭两者。
- **Results：** 独立成绩页显示真实总误差、最佳地点地图缩略图和逐题回看入口。提交后先显示“最终排名待公布”；揭晓后才显示排名。普通玩家等待下一局，只有管理员可重开；重开后所有在线入口自动换房，保留昵称并重新出题。
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

- Don't 将暗色主题、旧朱红票据或未约定的系统 emoji 混回界面组件；地图公共参考点与 ✅/❌ 操作是明确例外。
- Don't 在普通玩家入口提供建房和重开操作。
- Don't 提前暴露其他玩家的成绩与真点，或将缺失成绩显示为零。
- Don't 将设计文档或截图当作真实地图、30 人并发与完整流程验收。
