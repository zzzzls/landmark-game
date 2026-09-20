# Beautiful UI：项目自建参考

来源：[Beautiful UI](https://www.beautifului.dev/)，核查日期 2026-09-20。官网主页和公开导航未找到 skill 安装入口，`/llms.txt` 返回 404；这只说明本次检查未发现官方 skill。本文件是面向本游戏的原创适配指南。

该站主要展示 AI 工作界面，不能把它的聊天、审批、工具调用概念带进地图游戏。值得借鉴的是状态信息层次和操作反馈：

| 具体参考 | 项目应用 | 像素风适配 |
| --- | --- | --- |
| [Task Rows](https://www.beautifului.dev/#task-rows) | 大厅玩家准备状态、已提交数量 | 用名单行和紧凑状态标签对齐昵称、进度和动作；复用已有像素图标与语义色 |
| [Search](https://www.beautifului.dev/#search) | 地点搜索结果及加载、无结果、失败状态 | 保持输入与结果层次清晰；保留请求取消、确认添加和触屏目标，不引入命令面板操作负担 |
| [Loading State](https://www.beautifului.dev/#loading-state) | 地图加载或短暂连接过程 | 可参考点阵节奏，使用本地 SVG/CSS；不伪造进度或耗时，不永久播放装饰动效 |
| [Filter Table](https://www.beautifului.dev/#filter-table) | 管理员视图的状态区分 | 借鉴过滤与列表的清楚关联，不改变服务端成员状态或增加无必要的筛选功能 |

实际采用前打开对应示例检查布局与交互；这里只记录可用方向，不宣称已移植或验证源码。地图游戏的主操作应比说明和状态更醒目，不能让列表/装饰占满手机地图空间。

官网声明 [MIT License](https://www.beautifului.dev/license)，Copyright (c) 2026 Shane Levine。复制其代码或实质资源时保留完整版权与许可文本，核对所选资源自身的授权；不热链官网字体、图片或演示脚本。仅借鉴布局原则时使用本项目原创像素素材。
