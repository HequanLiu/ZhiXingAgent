# 声研业务能力契约 v0.1

状态：设计契约，不代表已实现接口。日期：2026-09-07。

## 通用调用信封

请求包含 requestId、tenantId、actor（可信用户身份与 agentTaskId）、capabilityId、capabilityVersion、bindingId、input。写入额外包含 idempotencyKey、expectedVersion；需确认的命令包含 approvalId、planVersion。身份和租户由网关注入，不能接受模型自报权限。

响应包含 invocationId、status（succeeded / rejected / pending / unknown）、objectRef、objectVersion、data、evidenceRefs、occurredAt。错误包含稳定 code、retryable、safeMessage；不暴露数据库错误或凭据。unknown 必须核实调用状态。

对象引用结构：{tenantId, providerId, objectType, objectId}。时间使用带时区 ISO 8601；金额使用整数最小货币单位及 currency，进度范围 0—100。

## 能力清单

| 能力 ID（版本 1） | 输入 | 输出及约束 |
|---|---|---|
| sampling.orders.list | status、cursor、limit（1—100） | items、nextCursor；只返回授权订单 |
| sampling.order.get | orderRef | 订单、节点、依赖、计划、权重、版本及证据引用 |
| sampling.node.assign | nodeRef、assigneeRef、expectedVersion | 更新后的负责人和版本；校验同租户及分配权限 |
| sampling.feedback.submit | nodeRef、sourceRef、reportedAt、completedQty/targetQty 或 percent、expectedFinishAt、blocker、evidenceRefs | feedbackRef、更新节点与版本；不自动验收 |
| sampling.node.accept | nodeRef、evidenceRefs、expectedVersion | accepted 状态；验收权限和前置条件必检 |
| sampling.schedule.evaluate | orderRef | forecastFinishAt、risk、affectedNodes、missingFacts、basisVersions；缺信息可返回空预测 |
| sampling.exception.create | orderRef、nodeRef、kind、evidenceRefs | exceptionRef、状态；同源异常去重 |
| sampling.change.propose | orderRef、patch、reason、basisVersions | immutable planRef、planVersion、成本/交期差异、审批要求 |
| sampling.change.apply | planRef、planVersion、approvalId、expectedVersion | 新业务版本；仅允许方案中列出的字段变化 |
| sampling.invocation.get | invocationId 或 idempotencyKey | 已执行/未执行/待处理/未知及结果引用 |

patch 仅允许 plannedFinishAt、promisedShipAt 和 extraCostMinor，其他字段返回 VALIDATION_ERROR。额外费用和承诺日期变更要求绑定计划版本的有效审批。审批属于平台；适配器传递可验证授权，业务服务校验对象与版本及自身业务权限。

## 示例反馈

```json
{
  "nodeRef": {"tenantId":"demo","providerId":"sample-ref","objectType":"sample_node","objectId":"A26-018-assembly"},
  "sourceRef": "mobile:feedback-001",
  "reportedAt": "2026-09-07T10:42:00+08:00",
  "completedQty": 13,
  "targetQty": 20,
  "blocker": "剩余7台等待网罩，到料时间待核实",
  "evidenceRefs": ["attachment:assembly-001"]
}
```

该 input 必须放入通用信封，附写入幂等键和预期版本。重复 sourceRef 不重复创建反馈；同一 sourceRef 内容变化返回 IDEMPOTENCY_CONFLICT。完成量不能超过目标量；数量及百分比同时出现且不一致时拒绝。

## 事件与 Channel

业务事件类型：sampling.feedback.recorded.v1、sampling.node.updated.v1、sampling.exception.updated.v1、sampling.change.applied.v1。信封包含 eventId、tenantId、objectRef、objectVersion、occurredAt、correlationId、data。参考服务通过事务 Outbox 发布，平台通过 Inbox 去重；断线后按游标补齐。

Channel 消息包含 channelId、externalMessageId、externalSenderId、conversationId、receivedAt、text、attachmentRefs。接入层从可信连接解析租户和身份映射；缺少映射返回 IDENTITY_UNMAPPED，不产生业务写入。订单或节点歧义进入 clarification_required。附件不是完成凭证的自动判定依据。

## 绑定与兼容

场景 Manifest 声明 requiredCapabilities、版本范围和可选能力；租户绑定记录 providerId、adapterId、授权引用和配置版本。安装检查缺失、主版本不兼容、能力授权不足并输出清单。领域契约由声研包及其适配器共享，不进入平台核心包。

第二测试提供方采用 ticketId、stageCode、ownerEmployeeCode 等不同字段；适配器必须明确状态映射，无法无损表达 accepted 时不得声称支持验收能力。测试通过不代表任意真实系统已兼容。

## 稳定错误码

VALIDATION_ERROR、NOT_FOUND、FORBIDDEN、IDENTITY_UNMAPPED、VERSION_CONFLICT、IDEMPOTENCY_CONFLICT、APPROVAL_REQUIRED、APPROVAL_STALE、CAPABILITY_UNAVAILABLE、PROVIDER_TIMEOUT、RESULT_UNKNOWN。仅具备明确安全重试语义的失败标记 retryable=true。
