# 知行 Agent · ZhiXing Agent

**知业务，行有据。 · From Insight to Action**

可组合的业务 Agent 平台。首个场景应用为「声研实验室」，由「声研助理」管理音响打样流程。

当前交付为可运行的本地试用版。DeepSeek Harness 是 Agent 内核，平台通过声明式能力和适配器访问独立业务服务；业务数据、审批和幂等结果由业务系统保存。真实 MiniMax-M3 只读分析已验证，尚未完成正式上线验收。

## 已有能力

- 打样订单总览、新建及单份/批量 JSON 导入、可复用模板库、音响七节点模板、流程依赖/日历/工期/负责人/权重/验收标准配置。
- 移动端数量或百分比反馈、预计完成和到料日期、PNG/JPEG/PDF 附件、报完工、验收和退回返工，保留每轮历史。
- 依赖及工作日交期预测；缺少事实显示待核实。自动巡检支持周期、工作时间、订单范围和升级时限；按租户调度，异常可分配、跟进、解决及关闭。
- 不可变交期/成本变更方案，经人工批准后手动执行或由明确委托的后台任务继续执行；版本冲突保护、固定幂等键和回执查询及业务审计。
- 失败分析人工重试、原失败审计、模型业务证据查看、供应商/超时/队列间隔设置、任务统计及供应商返回的用量记录。
- 演示身份和会话登录两种模式；租户成员、经理/成员角色、停用与审计；企业微信加密回调、可信人员映射及提醒发件队列。

## 本地启动

要求 Node 22.19+、pnpm 11.7.0、Docker Desktop。此目录是 `.worktrees/soundlab-platform`，分支 `codex/soundlab-platform`。

```powershell
pnpm.cmd install --frozen-lockfile
docker compose -p soundlab-dev up -d postgres
pnpm.cmd db:init
pnpm.cmd dev
```

首次启动需等待 PostgreSQL 健康。`db:init` 保留现有订单，通过版本化 SQL、校验和与事务锁执行迁移。桌面 http://127.0.0.1:5179/，移动端 http://127.0.0.1:5179/mobile；平台 API 4310、业务服务 4311、数据库 55439 均默认仅本机访问。

开发模式初始提供六个演示身份；陈静是初始经理，可管理人员、分配、验收、审批和平台配置，其余成员反馈本人节点。正式环境先初始化真实经理，再添加成员。100% 反馈进入待验收，不自动验收。

## Harness 与模型

最新更新（2026-09-08）：对话已注册 Harness 原生 `sampling_orders_read` 只读工具。Worker 签发绑定当前对话任务、3分钟有效的专用令牌；平台再次验证任务运行状态和当前启用成员身份，通过能力网关与业务适配器查询。只返回本轮提到的订单（未明确编号时使用最近对话提及编号），不外发客户名、反馈原文或附件，不提供业务写入工具。

工具查询结果和时间保存在 `chat_messages.evidence`，显示订单版本及进度证据卡。新回复完成后，页面依据证据里的订单编号联动列表选中、节点详情与右侧反馈；不根据自由文本猜测订单。历史证据卡可手动点击定位。旧回复的事实仅供追溯，实时询问会重新调用工具。

真实验证：`58a62257-d1d7-47a7-80e6-df73ea59b2d4` 经 MiniMax-M3 查询 A26-020，业务版本v1、整体49%、装配40%，浏览器自动联动通过，未修改业务。126项回归、类型检查、构建和健康检查通过；证据 `.runtime/chat-tool-live-verification.json`。以下纯文字连接记录为较早阶段。

2026-09-08：左侧输入框已接入 Harness + MiniMax-M3 连续文字对话。独立开关 `SOUNDLAB_CHAT_ENABLED=true`；按用户发送消息触发，不需要开启 `SOUNDLAB_MODEL_ANALYSIS`。历史按租户及成员隔离，发送最近6轮成功对话作为上下文；不自动附带订单、附件或业务读写工具。重启中断和失败不自动重发。用户需主动输入希望模型了解的内容，回复不代表业务已执行。

本地真实浏览器联调成功：消息 `b68ee87f-ed5c-401b-91e9-c3fbce5ae6df` 经 MiniMax-M3 回复“声研对话已连接。”；只发送连接测试文本。124项回归、类型检查、生产构建通过。证据 `.runtime/chat-live-verification.json`。自动分析与企微外发保持关闭。

相邻 `../harness-source` 使用官方源码基线 `d347e703908d0406b7a7ef80e3a0e594d86b2215`，SDK `0.1.3-alpha.1`。该版本 npm 返回 404，当前依赖本地源码构建；源码目录可用 `SOUNDLAB_HARNESS_SOURCE` 覆盖。先在其目录执行：

```powershell
pnpm.cmd install --frozen-lockfile --ignore-scripts
pnpm.cmd run build:lib:host
```

将本项目 `.env.example` 复制为 `.env`，只在文件中设置 `MINIMAX_API_KEY` 或 `DEEPSEEK_API_KEY`，不要提交密钥。启动器加载该文件，进程环境优先；密钥只传给 Worker。默认路由 MiniMax-M3，可切换 DeepSeek；第二供应商真实推理尚未验证。

`SOUNDLAB_MODEL_ANALYSIS` 模板默认 false。本地演示已获外发授权；模型数据限定原有 A26-018～A26-041，包含编号、产品、版本、风险、交期和节点负责人代号/进度，不包含客户名、反馈原文、附件或新增项目。接入正式订单需另外定义授权范围。

`pnpm.cmd probe:harness` 只初始化/关闭，不请求模型。`probe:model`、`probe:business` 会请求真实模型，执行前需有对应授权。

“运行设置”支持供应商、模型 ID、超时和队列检查间隔，在当前分析结束后生效；页面端点仅接受对应供应商批准地址，密钥不进入页面。队列默认每轮结束后等 5 秒，无事件不调用模型。“自动巡检”的分钟周期和工作时间独立配置，规则巡检不等于周期性调用模型；默认关闭，可由负责人开启。

## 验证与本机部署

```powershell
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd typecheck
pnpm.cmd build
pnpm.cmd start
```

测试不请求模型；集成测试使用本地 PostgreSQL 随机测试租户并清理测试数据。`start` 使用构建产物，默认会话登录模式；需先通过 `pnpm.cmd member:bootstrap` 初始化空租户的首位经理（`SOUNDLAB_USER_TENANT`、`SOUNDLAB_USER_ACTOR`、`SOUNDLAB_MEMBER_NAME`），再通过 `pnpm.cmd user:provision` 配置账户，参数由 `SOUNDLAB_USER_TENANT`、`SOUNDLAB_USER_NAME`、`SOUNDLAB_USER_ACTOR`、`SOUNDLAB_USER_PASSWORD` 环境变量提供。试用租户使用 demo；actor 必须对应本租户已启用成员，密码 12～256 字符。配置后清除密码环境变量，不放入聊天或脚本仓库。该命令不自动读取 .env。

现有服务占用端口时，先停止对应开发进程再启动。对外部署还需要 HTTPS、域名、进程托管和生产凭据；`SOUNDLAB_APP_ORIGIN` 必须等于网页实际 Origin，`SOUNDLAB_WEB_HOST` 控制构建服务器监听地址。

```powershell
pnpm.cmd backup
pnpm.cmd backup:verify
```

备份写入被忽略的 `.runtime/backups`；验证将两库恢复到随机临时数据库，校验后删除临时库，不覆盖原库。当前脚本用于本机 Docker PostgreSQL。备份仍需另行配置异地保存和访问权限。

`smoke:acceptance` 和 `smoke:patrol` 是显式业务写入验收，会保留新增测试订单，不会请求模型；后者临时修改巡检配置并在结束时恢复。普通回归不要重复执行这些写入脚本。

## 交付与接入边界

业务范围已按用户最新选择收敛为自研打样模块与企业微信。平台持久安装配置将场景能力绑定到已登记业务连接；调用有版本化输入/输出契约和成功、待审批、失败、未知结果状态。新增业务系统仍需实现对应适配器并通过契约测试。独立第二 HTTP 适配仅作为可替换性证明。

企业微信协议与队列已有本地加密回调、数据库和模拟传输验证；实际企业连接仍需应用凭据、成员 UserID 映射及公网 HTTPS 回调地址，见 [企微接入](docs/engineering/wecom-setup.md)。本轮没有发送真实企微消息或新增真实模型请求。当前运行保持模型分析与企微外发关闭。

部署、迁移、恢复、健康检查、发布包见 [部署手册](docs/engineering/deployment-runbook.md)。`pnpm smoke:browser` 通过独立 Chrome 执行桌面模板/批量导入和移动反馈；`pnpm release:package` 输出含校验清单的代码包，不打包密钥。CI 已提供，远端执行及正式服务器部署需要实际环境。模型用量无回执时保持未知，不推算费用。

最新测试结果和浏览器证据以 [验收记录](docs/engineering/soundlab-acceptance.md) 为准；完整范围见 [交付清单](docs/superpowers/plans/2026-09-07-soundlab-full-delivery.md)。业务写入使用固定接口，不透传任意业务 URL。

## Windows 原生依赖

跳过安装脚本后需构建 fs-ext。该锁文件的 pnpm 链接布局使 node-gyp 生成的 nan 头文件相对路径失效。已验证的处理是进入 `harness-source/node_modules/.pnpm/fs-ext@2.1.1/node_modules/fs-ext`，将 `CL` 设为 `/I"<harness-source绝对路径>\node_modules\.pnpm\nan@2.28.0\node_modules\nan"`，再执行 `npm.cmd rebuild --ignore-scripts=false`。本机 Python 3.11、VS2022 BuildTools 可完成编译；无需改上游源代码。CL 只作用于构建进程，不写全局环境。

## 已确认的集成限制

- SDK 仅提供 initialize、session/prompt 和 shutdown；没有单次 prompt 取消。
- SDK 尚未实现服务器到客户端的审批请求；业务审批需持久化到平台后继续运行。
- 关闭进程用于终止运行；不能因此推断远端业务写入已取消。
- `run()` 的最终文本属于一个运行区间，不是严格对应单条输入的业务成功证明；平台需读取业务回执验证。

详细产品规格和阶段计划见 `docs/superpowers/`，证据见 `docs/engineering/harness-integration-evidence.md`。

