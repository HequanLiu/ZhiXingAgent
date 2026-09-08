# 企业微信自建应用接入

当前实现本地协议与业务联调；没有真实凭据，尚未验证企业微信线上回调或发送。业务数据归本次自研打样模块，企微仅提供输入和通知通道。

## 配置与注册

配置仅从进程环境读取：`WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_CALLBACK_TOKEN`、`WECOM_ENCODING_AES_KEY`（43字符）、`WECOM_APP_SECRET`。禁止将实际值写入文档、日志或仓库。外发另需显式 `WECOM_SEND_ENABLED=true`，默认不发送。

在平台 API composition root 调用 `installWecom(app, db, invoke)`，`invoke(principal,input,key)` 通过现有 `sampling.feedback.submit` gateway 执行业务写入，保持传入的幂等键。该注册函数位于 `apps/platform-api/wecom.ts`。数据库使用已有 `migrateChannel` 创建的 channel 表。

自建应用“接收消息”URL 指向公开 HTTPS 地址的 `/api/wecom/callback`。网关需要保留原始 XML 和 query，GET 用于URL验证，POST 用于加密回调。回调无浏览器登录，使用企业微信签名、AES解密及 CorpID/AgentID 校验。时间戳允许5分钟偏差，部署需校准时钟。

管理员通过现有 channel:map 工具绑定 `channel=wecom` 的企微 UserID 到可信 tenant/actor。不得接受消息正文自称的租户或人员；同一 UserID 只支持一个绑定，目标必须是本租户启用成员。此部署为单 CorpID/单 AgentID。

## 反馈格式

严格受控命令，订单ID和节点ID使用现有业务ID：

```
反馈 SH-1 assembly v3 数量2/10
反馈 SH-1 assembly v3 百分比40% 预计2026-09-20
```

必须明确订单、节点、当前订单版本。自然语言、无版本、超界数量和无效日期会拒绝；不会猜测并写入。业务端继续验证负责人、版本和节点状态。MsgId 稳定去重，重复消息返回已有结果，内容冲突拒绝；丢失业务响应时，以相同业务幂等键重试。回调收到 `success` 代表已落库；失败HTTP状态可能触发企微重投。

图片/文件回调第一版拒绝 `WECOM_ASSOCIATION_REQUIRED`，不会下载媒体或猜测上下文。请在受认证的移动端/内置页面选择明确的订单、节点、版本后，通过已有附件上传业务接口提交证据。企微内登录SSO、图片自动接收、媒体下载尚未实现，回调错误JSON不会作为聊天回复展示。

## 提醒发送

`createWecomSender(config).sendText(userId, text)` 仅调用固定官方 `https://qyapi.weixin.qq.com/cgi-bin/gettoken` 和 `/cgi-bin/message/send`，禁止重定向与URL覆写。token带过期缓存；超过有效期重新获取。发送未启用时不获取token、无网络请求。

返回 `disabled`、`sent`、`failed`、`unknown`。`failed`表示未发送或API明确拒绝；网络断开、无效发送回执归 `unknown`，调用者必须记录状态并人工核对，不能自动重试。函数不重试消息。已接入巡检持久化通知发件箱：唯一人员映射缺失或歧义时跳过；明确失败最多三次退避，unknown 留待人工核对。首次启用前检查巡检页面收件人和积压记录；本次交付不进行真实消息发送。

## 验证和参考

`node --import tsx --test tests/wecom*.test.ts tests/integration/wecom.test.ts`：独立AES协议生产器、签名伪造、错误CorpID、过期时间戳、XML拒绝、显式命令、Fastify GET/拒绝POST、假发送transport、真实PG事务及重放/响应丢失。同名ID回放通过PG事务去重。

协议参考：企业微信团队提供的 [WXBizMsgCrypt.py](https://raw.githubusercontent.com/sbzhu/weworkapi_python/master/callback_python3/WXBizMsgCrypt.py)、[CorpApi.py](https://github.com/sbzhu/weworkapi_python/blob/master/api/src/CorpApi.py)。正式文档入口：[接收消息](https://developer.work.weixin.qq.com/document/path/90238)、[发送应用消息](https://developer.work.weixin.qq.com/document/path/90236)。本轮正式文档浏览工具无法读取，采用团队参考代码交叉核对；上线仍须真实测试应用验证。
