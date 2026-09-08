# 知行 Harness

本应用维护 Harness 的源码定位、运行配置和构建入口。Worker 通过 `packages/runtime-deepseek` 启动独立 SDK 子进程；不需要额外 HTTP 服务。

`upstream/` 是 `UPSTREAM.json` 记录提交的完整 Git 源码快照，保留上游 MIT 许可证及各依赖许可证。它随本仓库交付，不依赖相邻工作树、Git submodule 或符号链接。上游保持独立 pnpm workspace 和锁文件，构建产物及依赖不提交。

在项目根目录执行：

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd harness:install
pnpm.cmd harness:build
pnpm.cmd probe:harness
```

`harness:install` 跳过上游依赖的安装脚本，因此握手前还需构建原生 `fs-ext`；Windows 需要 Python 和 Visual Studio C++ Build Tools，具体命令见[本地开发说明的 Windows 原生依赖章节](../../docs/engineering/local-development.md#windows-原生依赖)。这与旧源码目录的构建要求一致。

默认使用本应用 `upstream/`。`SOUNDLAB_HARNESS_SOURCE` 可覆盖源码位置；相对路径始终从项目根目录解析。`probe:harness` 仅初始化和关闭，不发送模型请求。

升级时从官方仓库目标提交导出新的 Git 快照，同步 `UPSTREAM.json`，安装冻结依赖并验证 Host 构建和无模型握手，再运行平台回归。不要把本地依赖、运行状态或密钥混入源码快照。
