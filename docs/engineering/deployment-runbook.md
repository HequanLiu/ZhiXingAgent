# 声研实验室部署与运行

当前支持独立 Node 主机进程与 PostgreSQL。平台和业务使用不同数据库账户；浏览器只访问网页入口，平台经固定业务能力访问自研打样模块。正式服务器和企业微信域名尚未指定，本文件是可执行部署步骤，不是已上线证明。

## 准备

1. Node 22.19+、pnpm 11.7、PostgreSQL 17。开发库可使用仓库 docker-compose；生产使用单独数据库、账号和密码，分别配置 `BUSINESS_DATABASE_URL`、`PLATFORM_DATABASE_URL`。
2. `pnpm install --frozen-lockfile` 安装锁定依赖。模型关闭时可以启动业务服务；启用模型还需 README 所述固定提交的官方 Harness 源码构建。不能用未知版本替代已验收内核。
3. 配置 `.env`，不要提交。生产设 `SOUNDLAB_DEMO_MODE=false`、`SOUNDLAB_SEED_DEMO=false`，初期保持 `SOUNDLAB_MODEL_ANALYSIS=false` 和 `WECOM_SEND_ENABLED=false`。
4. 设置真实网站 `SOUNDLAB_APP_ORIGIN=https://你的域名`。反向代理转发到网页端口 5179；API 4310 和业务 4311 保持本机访问。HTTPS 由反向代理终止，必须保留 Origin、Cookie、SSE 和 XML 请求内容。会话 Cookie 在 HTTPS Origin 下启用 Secure。

## 初始化与启动

```powershell
pnpm.cmd db:init
pnpm.cmd build
pnpm.cmd start
```

数据库初始化命令从进程环境读取连接参数，不自动读取 `.env`；运维应通过其服务环境或秘密管理工具注入。`start` 加载项目 `.env`，进程环境优先。不要将连接密钥写进命令历史。

SQL 迁移位于 `migrations/business`、`migrations/platform`。每库在事务锁内验证 SHA256 和连续版本历史，DDL 与 ledger 同事务提交。已经应用的文件禁止编辑；新改动使用更大编号。升级失败先修复原因，再重跑；不要手工删除 ledger 强行跳过校验。

初次通过 `scripts/bootstrap-member.ts` 创建租户第一位经理，变量为 `SOUNDLAB_USER_TENANT`、`SOUNDLAB_USER_ACTOR`、`SOUNDLAB_MEMBER_NAME`。随后通过 `user:provision` 给已启用成员配置登录凭据；输入变量详见 README。其他人员由经理在页面管理。停用成员保留历史记录。

旧库若已有非演示登录账号但没有成员目录，初始化会报告 `MEMBER_REGISTRATION_REQUIRED`。先由管理员核对每个租户的真实经理和成员角色：空成员目录使用首位经理初始化，登录后登记其余已有 actor，再重跑 `db:init`。不按用户名猜测或自动授予经理权限；已有账号无需重复创建。维护窗口内完成目录登记后再开放普通用户登录。

在已有服务占用端口时先停止对应服务进程，避免同时启动两套。Worker 使用数据库单实例锁。正式环境应由 systemd、Windows 服务管理器或等效工具托管启动器；启动器退出后由托管工具重启并记录退出状态。

## 检查与告警

`pnpm healthcheck` 检查网页、两服务和 Worker 就绪状态，退出码非零表示需处理。平台 `/health` 检查数据库，`/health/ready` 检查后台心跳；运行管理页显示失败分析和超时任务。外部监控应周期调用健康命令并接入企业已有报警渠道。

- 启动失败：检查端口、两库连通性及迁移版本，不输出凭据排查。
- 分析失败：查看安全错误码、依据版本和重试审计。不要通过直接修改任务状态伪造完成。
- 企微通知 unknown：可能已经到达，先由业务人员核对；默认不会盲目重发。
- 变更执行 unknown：后台使用固定幂等键查询业务回执；审批或来源版本失效时停止执行，需重新提出方案。

## 备份、升级和回退

```powershell
pnpm.cmd backup
pnpm.cmd backup:verify
```

以上脚本适用于本机 Docker PostgreSQL，输出在 `.runtime/backups`。恢复验证使用随机临时数据库并在结束删除临时库，不覆盖原库。生产应采用数据库平台的定期备份与异地保管，并按同样原则做恢复演练。

升级前保存两库备份、当前代码包和配置引用。停止写入后部署新版本，先迁移、再构建、再启动、最后做健康与限定测试订单验收。回退代码必须保持 schema 兼容；不支持兼容回退时，用维护窗口中的完整双库备份恢复，不能只恢复单库造成事件与事实错位。

## 版本包

`pnpm release:package` 生成 `.runtime/releases/<时间>/soundlab.tar.gz`，包含源代码、SQL、构建网页和逐文件 SHA256 清单，排除 `.env`、依赖目录和运行数据。包不含 Node、pnpm、数据库、真实凭据及 Harness 源码依赖；安装前按 README 准备。CI 配置在 `.github/workflows/verify.yml`，远端流水线执行结果需实际推送后验证。

## 上线前尚需提供

企业微信 CorpID、AgentID、回调 Token/AESKey、应用 Secret、成员 UserID 映射，以及可访问的 HTTPS 回调域名。密钥填写部署环境，勿通过聊天发送。再依次验证 URL、真实成员回调、附件移动页、单接收人测试提醒和受控模型数据范围，最后开启所需策略。
