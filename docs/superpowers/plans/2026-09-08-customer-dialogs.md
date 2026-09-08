# 客户明细与弹框体验实施清单

用户已确认：延续紫色主题，统一样式并优化信息组织；覆盖功能菜单四页及全部业务弹框。

**Goal:** 客户能够快速识别业务状态、查阅反馈与证据、完成表单操作。
**Architecture:** 共享 BusinessModal、PanelSection 和 dialogs.css；管理页使用 Tabs 分组；记录与分析证据使用卡片、时间线及折叠详情。保留现有接口、权限与版本校验。
**Tech Stack:** React、Ant Design、TanStack Query、TypeScript、Vite、Playwright。

- [x] 统一弹框：标题说明、限定高度、独立内容滚动、固定底部关闭/确认操作、小屏布局；替换所有 Modal 入口。
- [x] 四个管理页：异常搜索与状态筛选；巡检设置/提醒/通知分组；运行设置/业务连接/任务用量分组；人员搜索与独立编辑弹框。
- [x] 反馈与证据：提取 OrderEvidence，按时间倒序呈现反馈、验收与返工；交期依据单独标签；AnalysisPanel 展示版本、查询时间和节点进度，增加证据加载、失败重试与空状态。
- [x] 业务表单：反馈、验收、分配、附件、变更、新建、流程配置使用相同容器；长表单底部操作保持可达。
- [x] 验证：pnpm.cmd typecheck、pnpm.cmd test、pnpm.cmd build；使用独立浏览器上下文逐个打开全部弹框，检查 1280px 和 390px 布局、标签切换、筛选、校验和关闭。只读真实业务，写入交互使用浏览器隔离模拟。

验收结果写入 docs/engineering/customer-dialog-review.md；不启用模型或消息外发。原有迁移换行符调整和 .pnpm-store 不纳入本次界面交付。
