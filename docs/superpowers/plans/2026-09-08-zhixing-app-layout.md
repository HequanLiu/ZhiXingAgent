# 知行应用目录调整

目标：采用用户指定的 apps/zhixing-harness、apps/zhixing-api、apps/zhixing-worker；克隆仓库即可取得 Harness 源码。

设计：API/Worker 等深度迁移并更新所有导入、启动入口和锁文件。Harness 应用拥有源码定位、探针配置及构建入口；upstream 目录保存固定 SHA 的完整官方源码和许可证，作为独立 pnpm 工程，平台 TypeScript 不扫描上游源码。运行适配层保持现有协议与模型授权开关。

实施与验证：
- 添加默认仓库内路径和自定义路径测试，观察失败。
- 迁移 API/Worker，纳入上游 Git 快照（不复制 .git、依赖、运行数据和密钥），统一 Harness 路径与配置。
- 更新安装构建说明、锁文件和发布打包；运行路径测试、全量单测、类型检查、前端构建、无模型握手。
- 检查旧路径引用与交付文件，提交并同步当前分支到远程 main。
