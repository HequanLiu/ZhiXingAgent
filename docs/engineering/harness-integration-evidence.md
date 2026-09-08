# DeepSeek Harness 集成核验

日期：2026-09-07。状态：固定源码检出、Host 构建和真实 SDK 初始化/退出通过；真实模型与业务工具调用尚未执行。

## 本轮执行证据

实施 checkout：`.worktrees/soundlab-platform`，分支 `codex/soundlab-platform`。官方源码独立保存在相邻 `harness-source`，HEAD 为下文 SHA；Node v22.19.0，pnpm 11.7.0。

- `pnpm.cmd install --frozen-lockfile --ignore-scripts`：成功，273个 workspace。
- `pnpm.cmd run build:lib:host`：退出0。
- fs-ext 原生编译：初始缺少模块，首次 node-gyp 编译因 nan.h 相对路径失败。使用 MSVC CL 的绝对 /I 参数后 `npm.cmd rebuild --ignore-scripts=false` 退出0；详见项目 README。没有修改上游跟踪源码。
- `npm.cmd test`：6通过、0失败；已观察测试先因缺少实现失败，再通过。
- `npm.cmd run probe:harness`：默认 MiniMax M3，返回 `initialized:true, modelRequestSent:false`，退出0。
- 设置 `SOUNDLAB_MODEL_ROUTE=deepseek` 后同命令：相同成功结果，退出0。
- 官方 npm 源未找到 `@deepseek-ai/dsh-sdk-client@0.1.3-alpha.1`（404），没有升级替换版本，当前从固定源码构建产物加载 SDK。

用户选择 MiniMax M3，密钥稍后提供。真实模型请求、工具执行、业务审批恢复及持久化重启恢复均未验证；握手通过不能证明上述功能。

## 固定源码发现的边界

`packages/sdk/protocol/README.md` 列出的请求只有 initialize、session/prompt、shutdown。`packages/sdk/client/README.md` 明确没有 mid-turn cancel、服务器到客户端请求尚未实现，run结果按运行区间收集。平台不得设计不存在的 SDK 工具回调或审批 RPC。

`packages/llm/llm-pi-ai/README.md` 支持声明式 provider 路由。默认 MiniMax 路由采用 openai-completions，准确模型 ID `MiniMax-M3` 与国内地址来自 [MiniMax 官方文档](https://platform.minimaxi.com/docs/api-reference/text-openai-api)。其多轮工具调用对完整 assistant 历史的要求需在真实兼容测试中验证，不能因协议名称相同而假定兼容。

## 来源与基线

用户明确选择 https://github.com/deepseek-ai/deepseek-harness 。awesome-deepseek-harness 是生态目录，不作为运行时来源。

`git ls-remote https://github.com/deepseek-ai/deepseek-harness.git refs/heads/master` 返回：

```text
d347e703908d0406b7a7ef80e3a0e594d86b2215 refs/heads/master
```

该提交已检出并完成 Host 构建。下面网页阅读最初来自 master，关键 SDK 接口已对照固定源码；源码各包版本为0.1.3-alpha.1，未采用未发布的 npm 依赖。官方 README 明确当前为开发者预览，存在破坏性变更。

## 已读官方依据

- [README](https://github.com/deepseek-ai/deepseek-harness)：npm 和源码启动入口、开发预览状态。
- [架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：Cordis 插件组合、profile、工具与会话扩展边界。
- [开发指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)：Node 22.19+ 或24+，仓库 pnpm 11.7.0，以及源码安装构建流程。
- [SDK 应用](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/README.md)：stdio JSON-RPC、初始化、退出和默认编码角色。
- [工具扩展入口](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)：后续固定版本实现时检查注册代码。

## 对本项目的设计结论

采用独立运行进程及运行时适配层，优先核验 SDK profile。工具注册通过官方扩展点；平台能力网关仍是业务写入入口。业务包不导入 Cordis context 或 Harness 私有类型。

默认 SDK 组合带编码角色及基础工具，不能直接视为声研生产配置。自定义 profile/patch 只装载所需业务工具，保持 SDK 服务，并使用独立 Harness home。运行上下文隔离方案必须经过多租户测试，不能仅靠提示词隔离。

SDK stdout 保留给逐行 JSON-RPC，应用日志走 stderr。配置变更需重启。只读工具探针先行；批准后的业务写入通过平台校验方案和对象版本，不将 Harness 自身的工具许可等同业务审批。

会话日志机制不自动提供平台任务和业务事务的一致性。平台保留幂等、任务持久化、审批及结果核实责任。

## 核验清单

1. 已检出上述 SHA，阅读 SDK 客户端、服务端及工具扩展示例，客户端与运行时来自同一源码。
2. 已检查 Node/pnpm，使用隔离目录和独立配置安装。
3. 已运行两供应商的无模型初始化/退出探针，确认握手与关闭。
4. 在配置可用模型凭据后，跑一次真实订单查询工具调用，验证请求、工具回执与结束结果。
5. 分别测试取消、等待确认后继续、进程重启恢复；记录原生能力和平台补偿边界。

未执行以上步骤前，不标记交付计划阶段0或验收A8完成。
