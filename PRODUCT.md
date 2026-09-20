# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
同一局域网内的手机玩家、可参赛的房主，以及观看横屏大屏的参与者。

## Product Purpose
北京地标盲猜：每人贡献两个地点，凭无文字地图猜三个地点，按总距离误差升序排名。

## Capabilities and Constraints
React/Vite + FastAPI/WebSocket + 高德。房间与成绩仅在服务内存中保存。房主可只主持或兼任玩家。单人三道系统题，排除本人贡献；多人至少一道系统题且不抽本人地点。揭晓前隐藏真坐标、误差和排名。未就绪和中途加入者旁观本局。

## Product Principles
- 手机单手操作优先，每阶段知道下一步。
- 服务端状态是确认操作成功的依据。
- 地图必须真实加载，接口模拟不等于可玩验收。
- 保留局域网轻量玩法，不引入账号或持久化。
