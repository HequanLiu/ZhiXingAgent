# 知行 Agent · ZhiXing Agent

**知业务，行有据。**

基于 DeepSeek Harness 的业务 Agent 平台。首个应用「声研实验室」用于管理音响打样，支持订单跟进、进度反馈、异常处理和人工审批。目前为本地试用版。

## 目录

```text
apps/
├── zhixing-web/       # 平台前端
├── zhixing-api/       # 平台 API
├── zhixing-worker/    # 后台任务
├── zhixing-harness/   # Agent 运行时及上游源码
└── soundlab-api/      # 声研打样业务
packages/             # 共享模块与业务适配器
docs/                 # 设计、开发与部署文档
```

## 本地启动

准备 Node.js 22.19+、pnpm 11.7.0 和 Docker Desktop，在项目根目录执行：

```powershell
pnpm.cmd install --frozen-lockfile
docker compose -p soundlab-dev up -d --wait postgres
pnpm.cmd db:init
pnpm.cmd dev
```

访问 [桌面端](http://127.0.0.1:5179/) 或 [移动端](http://127.0.0.1:5179/mobile)。

启用 AI 功能需先完成 [Harness 安装与构建](apps/zhixing-harness/README.md)，再按 `.env.example` 配置本地 `.env` 中的模型凭据和功能开关。

## 开发检查

```powershell
pnpm.cmd test
pnpm.cmd test:integration
pnpm.cmd typecheck
pnpm.cmd build
```

集成测试需要本地 PostgreSQL。

## 文档

- [本地开发与模型配置](docs/engineering/local-development.md)
- [部署手册](docs/engineering/deployment-runbook.md)
- [企业微信接入](docs/engineering/wecom-setup.md)
- [验收记录](docs/engineering/soundlab-acceptance.md)

## 许可证

[MIT](LICENSE)
