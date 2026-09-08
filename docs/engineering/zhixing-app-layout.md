# 知行应用目录迁移验证

日期：2026-09-08；工作树：`.worktrees/soundlab-platform`。

API 和 Worker 分别迁入 `apps/zhixing-api`、`apps/zhixing-worker`；启动入口、平台间导入、测试和 workspace 锁文件同步更新。`apps/zhixing-harness` 保存配置和源码定位逻辑；其 `upstream` 目录保存完整官方源码快照。数据库迁移文件保持原样，避免变更既有校验和。

上游固定提交：`d347e703908d0406b7a7ef80e3a0e594d86b2215`。暂存区 9,080 个文件逐项对比上游 Git blob 和文件模式，差异为零；保留 MIT 许可证、内部符号链接及脚本可执行位。没有复制上游 Git 数据、依赖或本地运行配置。

本轮验证：

- 路径解析测试先观察缺少新模块失败，实施后通过。
- 平台冻结锁文件安装通过；单元测试 88/88、数据库集成测试 40/40。
- `pnpm.cmd typecheck`、`pnpm.cmd build` 通过。前端构建仍有原有大 chunk 提示。
- 在仓库内 `apps/zhixing-harness/upstream` 独立安装冻结依赖、构建 Host 成功；Windows `fs-ext` 原生编译成功。
- 默认新路径运行 `pnpm.cmd probe:harness` 返回 `initialized:true, modelRequestSent:false`。
- 从新目录恢复本地服务后，Web、平台 API、业务服务及 Worker readiness 四项健康检查通过。
- 发布打包成功；11,209 个文件，三个新应用入口及许可证齐全，未包含 node_modules。独立静态审查未发现高／中优先级回归。

本轮未调用真实模型、未发送企微消息；上述握手结果不代表真实模型业务验收。新机器仍需安装依赖、构建 Harness，并配置自身数据库和凭据。
