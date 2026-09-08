# Soundlab Delivery Implementation Plan

> **For agentic workers:** Use executing-plans for inline execution. This document is the phased delivery plan; expand each phase into file-level code steps after its dependencies and runtime interfaces have been verified. Do not treat proposed interfaces as verified Harness APIs.

**Goal:** Deliver a working sampling-management loop and demonstrate provider replacement without changing platform core.

**Architecture:** Harness connects through a runtime adapter. The platform governs generic execution; the Soundlab scenario consumes domain capability contracts implemented by independent business adapters.

**Tech Stack:** User-confirmed on 2026-09-07: pnpm workspace; React + TypeScript + Vite, Ant Design with intelligent-purple theme, TanStack Query and SSE; Node.js + TypeScript + Fastify, separate Worker, PostgreSQL and S3-compatible object storage. DeepSeek Harness runs behind the SDK adapter; MiniMax M3 is the default configurable model route. Verify and lock dependency versions during bootstrap.

---

## 实施依据与状态

2026-09-07 首个业务闭环已实现：React 桌面及移动反馈、负责人分配、通用网关/参考适配器、业务事务 Outbox、独立 Worker、分离 PostgreSQL 和 SSE。12 项单元测试、2 项数据库集成测试、类型检查及构建通过；浏览器验证移动提交、桌面自动刷新及刷新后持久化。详见 `docs/engineering/soundlab-acceptance.md`。各阶段混合包含的模型、审批、Channel 等未实现项仍保持未完成，以下演示脚本为目标脚本，当前不支持其中的附件、预测和审批步骤。

- 规格：`docs/superpowers/specs/2026-09-07-soundlab-agent-platform-design.md`
- 契约：`docs/superpowers/specs/2026-09-07-soundlab-capability-contract.md`
- 当前已完成设计、固定源码构建与两供应商 SDK 握手。官方仓库为 `deepseek-ai/deepseek-harness`，检出基线为 `d347e703908d0406b7a7ef80e3a0e594d86b2215`，见 `docs/engineering/harness-integration-evidence.md`。真实模型和业务工具链路尚未完成。
- 当前计划是阶段拆解，不是含完整代码的逐文件施工计划。每阶段开始时读取实际工程与已核验接口，展开测试、实现和确切运行命令。

## 目录边界

| 拟建路径 | 单一职责 |
|---|---|
| apps/platform-api/ | 通用任务、能力网关、审批及查询入口 |
| apps/platform-worker/ | Outbox/Inbox 消费、定时唤醒及执行恢复 |
| apps/sample-reference-service/ | 独立权威打样服务和示例数据 |
| apps/web/ | 声研实验室桌面入口、移动反馈和人工操作 |
| packages/platform-contracts/ | 通用信封、对象引用及运行适配接口 |
| packages/sampling-contracts/ | 打样领域能力 Schema |
| packages/runtime-deepseek/ | 经过核验的 Harness 集成 |
| packages/scenario-soundlab/ | Manifest、知识、策略和界面注册 |
| packages/adapter-sample-reference/ | 参考服务映射 |
| packages/adapter-sample-alternative/ | 第二提供方测试映射 |
| packages/channel-test/ | 本地反馈入口、可控时钟与消息收件箱 |
| tests/architecture/ | 包依赖边界检查 |
| tests/contracts/ | 能力兼容和提供方替换测试 |
| tests/integration/ | 持久化、事件、审批、重试和隔离 |
| tests/e2e/ | 桌面、移动反馈、人工兜底闭环 |

## 阶段 0：核验运行内核与建立工程边界

- [x] 检查实际 checkout、worktree 和现有未提交内容，创建隔离实施工作区。
- [ ] 确认 DeepSeek Harness 确切仓库和版本，记录启动、工具回调、取消、恢复的真实接口到 `docs/engineering/harness-integration-evidence.md`。缺来源时向用户询问该项，继续独立契约工作。
- [ ] 运行最小真实探针：提交查询任务、接收工具请求、返回结果、记录结束；记录取消与恢复的支持情况，隐藏凭据。
- [ ] 建立包目录、开发数据库、依赖锁与统一命令；增加架构测试，先验证平台导入 sampling-contracts 会失败，再建立正确依赖。
- [ ] 交付运行说明和证据；不以模拟 Harness 宣布联通。独立提交本阶段已验证文件。

## 阶段 1：可人工使用的打样服务与契约

阶段0补充进度：固定源码与 Host 构建完成，两供应商真实握手通过；真实模型探针、工具桥接和工程包边界检查尚未完成。MiniMax M3 为默认模型，用户密钥稍后提供，仍不得将阶段0整体标为完成。

- [ ] 将 v0.1 契约转为运行时 Schema；先测试非法数量、跨租户、缺少版本及重复反馈。
- [ ] 实现订单、节点、依赖、负责人、反馈和验收存储及迁移，平台和业务使用独立数据库凭据。
- [ ] 提供 24 单固定示例数据，以及“装配13/20、待料”与“测试失败”的测试样本。
- [ ] 实现进度权重、依赖交期评估和缺少事实分支；验证节点65%不等同订单65%。
- [ ] 实现参考适配器和事务 Outbox；验证同一事务中业务状态与事件一致。
- [ ] 交付可调用的人工业务接口及契约测试结果，独立提交。

## 阶段 2：平台执行与声研场景

- [ ] 实现 Manifest 安装、租户绑定及缺失能力检查；用不兼容版本证明安装被拒绝。
- [ ] 实现通用能力网关、授权校验、幂等调用记录和运行适配器；所有写操作经过网关。
- [ ] 声研场景读取分页在制订单、查询节点、生成有证据的摘要与待核实事项。
- [ ] 实现持久化唤醒和恢复；以可控时钟验证营业时间、限频、重复事件和重启。
- [ ] 真实 Harness 完成查询和合法工具调用；把真实与模拟执行证据分别记录，独立提交。

## 阶段 3：移动反馈及实验室界面

- [ ] 创建桌面三栏界面、订单筛选、节点详情、负责人设置与原始证据入口。
- [ ] 实现“我的节点”和移动反馈页；只显示当前身份有权反馈的节点。
- [ ] 实现测试 Channel 的身份映射、消息去重、对象歧义澄清；无映射不写入。
- [ ] 跑通移动反馈→业务保存→事件唤醒→助理摘要→风险展示；失败反馈可查询且不会展示成成功。
- [ ] 验证桌面与手机尺寸、键盘操作、控制台及 Agent 停机时的人工操作，独立提交。

## 阶段 4：异常、确认和结果验证

- [ ] 实现不可变方案、审批版本绑定和影响展示；先测试拒绝、重复批准、对象版本变化。
- [ ] 接入 sampling.change.apply 和结果查询；超时进入核实状态，禁止盲重试。
- [ ] 运行加价 ¥600、顺延1天的确认场景，验证未批准不写入、批准后只执行一次。
- [ ] 验证审批后 Harness 恢复或重新运行、读取结果并完成任务；错误保留原始关联轨迹，独立提交。

## 阶段 5：低耦合验收与交付

- [ ] 第二测试提供方采用不同字段及状态，实现独立适配器并运行同一套契约与场景测试。
- [ ] 只改租户绑定运行同一闭环，对比平台核心无修改，保存测试差异和能力缺项报告。
- [ ] 故障验证覆盖重复反馈、乱序、网络超时、进程重启、越权和过期审批。
- [ ] 按 A1—A9 逐项记录命令、结果和限制到 `docs/engineering/soundlab-acceptance.md`，补运行与演示说明。
- [ ] 真实 Channel 联通单列验收；没有实际渠道授权时清楚注明仅移动端和测试 Channel 可用。

## 首次演示脚本

1. 打开24单总览，选 A26-018，查看各节点负责人和计划。
2. 节点负责人移动端提交13/20台装配完成、网罩到料待核实及图片。
3. 助理展示节点65%、来源及待核实事项，记录下一次跟进。
4. 补充预计到料时间，业务服务重新评估交期，助理生成方案。
5. 审批人查看费用和日期差异并确认；读取业务结果和完整执行记录。
6. 切换第二测试提供方重复场景，展示平台及场景代码未变。

## 规格覆盖

A1/A2/A9 → 阶段1、3；A3 → 阶段1、2；A4 → 阶段4；A5/A6 → 阶段1、2、4、5；A7 → 阶段5；A8 → 阶段0、2、4。
