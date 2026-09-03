# Agent Platform PRD and HTML Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a complete Chinese PRD and a standalone interactive HTML prototype for the confirmed Agent Enterprise Application Platform, using ERP plus the apparel foreign-trade package as the first product composition.

**Architecture:** The PRD derives normative product requirements and acceptance criteria from the approved design specification. The prototype is a single `prototype/index.html` file with inline CSS and JavaScript; it demonstrates the Agent-first shell, dynamic business workspace, risk-tiered autonomy, approval flow, and installable app navigation without pretending to implement production back-end behavior.

**Tech Stack:** Markdown, semantic HTML5, CSS custom properties and responsive layout, vanilla JavaScript, Node.js built-in test runner, in-app browser visual verification.

---

## File map

- Create `docs/agent-enterprise-application-platform-prd.md`: normative product requirements, releases, user journeys, functional requirements, data/security rules, and acceptance criteria.
- Create `prototype/index.html`: single-file interactive desktop Web prototype with inline styles and behavior.
- Create `tests/prototype-contract.test.mjs`: static contract tests for required structure, modules, states, interactions, accessibility, and single-file delivery.
- Create `prototype/design-qa.md`: viewport, interaction, console, accessibility, and reference-comparison evidence.
- Modify `docs/superpowers/plans/2026-09-03-agent-platform-prd-and-html-prototype.md`: check completed steps during execution.

## Task 1: Write the product requirements document

**Files:**
- Read: `docs/superpowers/specs/2026-09-03-agent-enterprise-application-platform-design.md`
- Create: `docs/agent-enterprise-application-platform-prd.md`

- [ ] **Step 1: Create the PRD with normative requirement IDs**

Write the PRD with this exact top-level structure:

```markdown
# Agent 企业应用平台产品需求文档

版本：V1.0
状态：已确认设计的产品化需求
首发组合：Agent Platform + CRM 基础包 + ERP 应用套件 + 服装外贸行业包

## 1. 文档说明
## 2. 产品定位
## 3. 目标客户、角色与核心问题
## 4. 产品目标、指标与非目标
## 5. 产品原则与术语
## 6. 产品信息架构
## 7. Agent Platform 功能需求
## 8. Business Capability Protocol
## 9. CRM 基础包需求
## 10. ERP 应用套件需求
## 11. 服装外贸行业包需求
## 12. Agent 自治、授权与审批
## 13. 数据模型与跨应用协作
## 14. 多租户、权限、安全与审计
## 15. 异常处理与人工兜底
## 16. 国际化、搜索、通知与附件
## 17. 非功能需求
## 18. 测试与发布门槛
## 19. 版本范围与路线图
## 20. V1 验收标准
## 21. 原型范围与映射
## 22. 明确排除项
```

Use requirement prefixes consistently:

```markdown
- `PLT-[0-9]{3}`: Agent Platform and common platform behavior.
- `BCP-[0-9]{3}`: application manifest, capabilities, events, surfaces, and policies.
- `CRM-[0-9]{3}`: CRM foundation package.
- `ERP-[0-9]{3}`: ERP suite.
- `IND-[0-9]{3}`: apparel foreign-trade package.
- `AUT-[0-9]{3}`: autonomy, authorization, approval, and safety.
- `DAT-[0-9]{3}`: data ownership, identifiers, and events.
- `SEC-[0-9]{3}`: tenancy, identity, permission, audit, and security.
- `NFR-[0-9]{3}`: performance, availability, recovery, accessibility, and observability.
```

Every functional requirement must state actor, trigger, expected result, failure behavior, and acceptance evidence. Include at minimum these fixed product rules:

```markdown
- AUT-001: R0 queries execute automatically.
- AUT-002: R1 reversible internal changes execute automatically and expose undo or compensation.
- AUT-003: R2 changes execute only inside tenant-configured thresholds and notify the responsible user.
- AUT-004: R3 legal, financial, safety, or irreversible changes require a version-bound human confirmation.
- AUT-005: R4 actions are always denied and cannot be downgraded by an app package.
- SEC-001: Every operation is authorized against tenant, human actor, Agent identity, role, and data scope.
- DAT-001: Business facts are read from the owning app and never treated as model memory.
- BCP-001: Installing an app registers manifest, objects, capabilities, events, surfaces, and policies without modifying Agent Platform core.
```

- [ ] **Step 2: Define the V1 apparel foreign-trade journey and module acceptance**

Document the V1 business chain exactly as:

```text
客户需求 → 报价 → 销售订单 → 采购 → 跟单 → 质检 → 出运 → 收付款 → 订单利润
```

For each module, specify object ownership, primary list/detail/form surfaces, Agent queries, Agent write capabilities, risk defaults, domain events, and manual fallback. Keep factory production, process reporting, equipment, payroll, tax filing, and professional general ledger out of V1.

- [ ] **Step 3: Add measurable quality and acceptance requirements**

Include these quantitative targets:

```markdown
- NFR-001: P95 interactive query response under 2 seconds excluding model generation and third-party latency.
- NFR-002: P95 platform capability-gateway overhead under 200 ms excluding the business handler.
- NFR-003: Acknowledgement of an asynchronous Agent task within 1 second.
- NFR-004: No duplicate business result for repeated calls with the same idempotency key.
- NFR-005: 100% of write capabilities produce an audit record containing actor, plan version, object, before/after reference, result, and correlation chain.
- NFR-006: Critical manual ERP workflows remain usable while Agent Runtime is unavailable.
- NFR-007: Desktop views support 1280x800 and 1440x900; compact read-only triage remains usable at 920x1080 and 440x1024.
```

- [ ] **Step 4: Run PRD quality scans**

Run:

```powershell
rg -n '^## ' docs/agent-enterprise-application-platform-prd.md
$unfinished = @('T'+'BD', 'T'+'ODO', 'FIX'+'ME', '待'+'定', '占'+'位')
Select-String -Path docs/agent-enterprise-application-platform-prd.md -Pattern $unfinished
rg -o '(PLT|BCP|CRM|ERP|IND|AUT|DAT|SEC|NFR)-[0-9]{3}' docs/agent-enterprise-application-platform-prd.md | Sort-Object | Group-Object | Where-Object Count -gt 1
```

Expected: all 22 second-level sections are present; placeholder scan returns no matches; duplicate requirement-ID scan returns no output.

- [ ] **Step 5: Commit the PRD**

```powershell
git add -- docs/agent-enterprise-application-platform-prd.md
git commit -m "docs: add agent enterprise platform PRD"
```

## Task 2: Define the prototype contract with failing tests

**Files:**
- Create: `tests/prototype-contract.test.mjs`
- Test: `tests/prototype-contract.test.mjs`

- [ ] **Step 1: Add structural and content tests**

Create the test file with Node's built-in test runner and assertions for the required prototype contract:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(here, "../prototype/index.html");
const html = () => readFileSync(htmlPath, "utf8");

test("prototype is a complete standalone HTML document", () => {
  const source = html();
  assert.match(source, /<!doctype html>/i);
  assert.match(source, /<style>[\s\S]*<\/style>/i);
  assert.match(source, /<script>[\s\S]*<\/script>/i);
  assert.doesNotMatch(source, /src=["']\.\//i);
  assert.doesNotMatch(source, /href=["']\.\//i);
});

test("Agent-first shell exposes all four reference regions", () => {
  const source = html();
  for (const region of ["global-header", "app-navigation", "agent-cockpit", "business-workspace"]) {
    assert.match(source, new RegExp(`data-region=["']${region}["']`));
  }
});

test("first product composition exposes required modules", () => {
  const source = html();
  for (const module of ["总览", "CRM", "商品", "销售", "采购", "跟单", "质量", "出运", "财务", "利润", "数据", "设置"]) {
    assert.ok(source.includes(`data-module="${module}"`), `missing module ${module}`);
  }
});

test("prototype contains autonomy, approval, and app-platform concepts", () => {
  const source = html();
  for (const marker of ["观察", "协作", "自主", "R3", "待我确认", "能力注册中心", "ERP 应用套件", "MES 合约探针"]) {
    assert.ok(source.includes(marker), `missing marker ${marker}`);
  }
});

test("interactive controls are wired by stable data actions", () => {
  const source = html();
  for (const action of ["switch-module", "select-order", "switch-tab", "set-autonomy", "submit-command", "open-approval", "approve-action", "reject-action", "toggle-app-drawer"]) {
    assert.ok(source.includes(`data-action="${action}"`), `missing action ${action}`);
  }
});

test("visible controls and workspace regions have accessible labels", () => {
  const source = html();
  assert.match(source, /<nav[^>]+aria-label="企业应用主导航"/);
  assert.match(source, /aria-label="向 Agent 下达目标"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="dialog"/);
});

test("prototype has no unfinished placeholder copy", () => {
  const unfinished = new RegExp(["T" + "BD", "T" + "ODO", "FIX" + "ME", "lorem " + "ipsum", "待" + "补充", "占位" + "内容"].join("|"), "i");
  assert.doesNotMatch(html(), unfinished);
});
```

- [ ] **Step 2: Run the test to verify it fails before the HTML exists**

Run:

```powershell
node --test tests/prototype-contract.test.mjs
```

Expected: FAIL with `ENOENT` for `prototype/index.html`.

- [ ] **Step 3: Commit the failing contract test**

```powershell
git add -- tests/prototype-contract.test.mjs
git commit -m "test: define agent platform prototype contract"
```

## Task 3: Build the single-file Agent-first shell

**Files:**
- Create: `prototype/index.html`
- Test: `tests/prototype-contract.test.mjs`

- [ ] **Step 1: Create the semantic HTML shell**

Create one complete document using this region hierarchy:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LoomFlow Agent Enterprise Platform</title>
  <style>/* all prototype styling remains inline */</style>
</head>
<body>
  <div class="app-shell" data-app="loomflow-agent-platform">
    <header class="global-header" data-region="global-header"></header>
    <nav class="app-navigation" data-region="app-navigation" aria-label="企业应用主导航"></nav>
    <main class="agent-cockpit" data-region="agent-cockpit" aria-live="polite"></main>
    <section class="business-workspace" data-region="business-workspace"></section>
  </div>
  <aside class="app-drawer" aria-label="应用与能力中心"></aside>
  <section class="approval-modal" role="dialog" aria-modal="true" aria-labelledby="approval-title" hidden></section>
  <script>/* all interaction logic remains inline */</script>
</body>
</html>
```

Populate the shell with realistic data for order `SO-2026-0831`, customer `Fashion Hub Ltd.`, planned ship date `2026-09-08`, current progress `62%`, delayed fabric arrival, and a proposed print supplier switch with cost and margin impact.

- [ ] **Step 2: Implement the visual system from the reference image**

Use CSS variables with these values:

```css
:root {
  --nav: #073c61;
  --nav-active: #0a7da7;
  --brand: #08a6a6;
  --brand-soft: #e9f8f7;
  --canvas: #f4f7fa;
  --surface: #ffffff;
  --line: #dfe7ee;
  --text: #183248;
  --muted: #6f8190;
  --success: #0f9f6e;
  --warning: #e58b19;
  --danger: #dd3f3f;
  --shadow: 0 12px 34px rgba(23, 50, 72, 0.10);
  --radius: 10px;
}
```

At widths of 1280 pixels and above, use four columns: `68px minmax(320px, 27vw) minmax(0, 1fr)` with the header spanning the full viewport. The business workspace owns the majority of the width. At 920 pixels, collapse the Agent cockpit into a slide-over and preserve the workspace. At 440 pixels, show navigation, autonomy state, risk list, approval, and task status as a triage view; do not pretend the full ERP form is usable on mobile.

Match the supplied reference's visual language: dark turquoise navigation, cloud-white surfaces, compact data density, fine gray dividers, small status pills, limited shadow, and clear red/amber/green risk semantics. Do not use gradients, neon effects, robot imagery, decorative AI spectacle, emoji, or invented illustration assets.

- [ ] **Step 3: Populate navigation, Agent cockpit, and delivery workspace**

The prototype must visibly include:

```text
Top bar: LoomFlow | Mission Control | global search | autonomy selector | pending approvals | user
Navigation: 总览 CRM 商品 销售 采购 跟单 质量 出运 财务 利润 数据 设置
Agent cockpit: current goal | analysis | safe actions | pending R3 confirmation | suggested commands | composer
Workspace: weekly risk order list | selected order header | milestone timeline | dependencies | mitigation plan | owner list | activity
App drawer: installed packages | capability registry | ERP suite | CRM foundation | MES contract probe
Approval modal: evidence | impact | plan version | modified objects | approve/reject
```

- [ ] **Step 4: Run structural tests**

Run:

```powershell
node --test tests/prototype-contract.test.mjs
```

Expected: tests that only require structure and content PASS; interaction assertions may remain static contract checks until Task 4.

- [ ] **Step 5: Commit the visual shell**

```powershell
git add -- prototype/index.html
git commit -m "feat: add agent enterprise platform HTML shell"
```

## Task 4: Implement prototype interactions and state transitions

**Files:**
- Modify: `prototype/index.html`
- Test: `tests/prototype-contract.test.mjs`

- [ ] **Step 1: Define prototype state and render functions**

Use this state contract in the inline script:

```js
const state = {
  activeModule: "跟单",
  autonomy: "自主",
  workspaceMode: "work",
  selectedOrder: "SO-2026-0831",
  activeTab: "交付全景",
  approvalOpen: false,
  approvalStatus: "pending",
  appDrawerOpen: false,
  commandHistory: [],
};

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function render() {
  renderNavigation();
  renderAgentCockpit();
  renderWorkspace();
  renderApproval();
  renderAppDrawer();
}
```

Render from state rather than changing unrelated DOM nodes ad hoc.

- [ ] **Step 2: Wire all stable actions through event delegation**

Use one click handler and one submit handler:

```js
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;
  if (action === "switch-module") setState({ activeModule: target.dataset.module });
  if (action === "select-order") setState({ selectedOrder: target.dataset.order });
  if (action === "switch-tab") setState({ activeTab: target.dataset.tab });
  if (action === "set-autonomy") setState({ autonomy: target.dataset.mode });
  if (action === "open-approval") setState({ approvalOpen: true });
  if (action === "approve-action") setState({ approvalOpen: false, approvalStatus: "approved" });
  if (action === "reject-action") setState({ approvalOpen: false, approvalStatus: "rejected" });
  if (action === "toggle-app-drawer") setState({ appDrawerOpen: !state.appDrawerOpen });
});

document.querySelector("[data-action='submit-command']").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = event.currentTarget.elements.command;
  const command = input.value.trim();
  if (!command) return;
  state.commandHistory.push({ command, status: "已分析并生成受控执行计划" });
  input.value = "";
  render();
});
```

- [ ] **Step 3: Implement meaningful module and approval behavior**

Required behavior:

- Switching modules updates the active navigation state, Agent goal, suggested commands, and workspace title.
- Selecting a risk order updates the workspace header, progress, timeline, and dependency rows.
- Switching order tabs changes between `交付全景`, `基本信息`, `采购`, `质量`, `出运`, and `财务` content.
- The autonomy selector switches among `观察`, `协作`, and `自主` and updates explanatory copy.
- Approving the R3 supplier switch changes its status to `已批准`, appends an activity item, and exposes the next controlled action.
- Rejecting it changes status to `已拒绝` and records that the Agent retained the current supplier.
- Opening the app drawer shows registered apps and capability counts without navigating away from the current order.
- Escape closes the modal or drawer and focus returns to the triggering control.

- [ ] **Step 4: Add reduced-motion, keyboard, and focus behavior**

Include:

```css
:focus-visible { outline: 3px solid rgba(8, 166, 166, 0.35); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

Use native buttons for all actions, `aria-current="page"` for active navigation, `aria-selected` for tabs, `aria-expanded` for the app drawer, and a visible focus ring.

- [ ] **Step 5: Run the full static contract**

Run:

```powershell
node --test tests/prototype-contract.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 6: Commit interactions**

```powershell
git add -- prototype/index.html tests/prototype-contract.test.mjs
git commit -m "feat: make agent platform prototype interactive"
```

## Task 5: Browser verification and design QA

**Files:**
- Create: `prototype/design-qa.md`
- Modify: `prototype/index.html` only when a verified issue requires a fix
- Test: `tests/prototype-contract.test.mjs`

- [ ] **Step 1: Open the prototype in the in-app browser**

Open the absolute local path or serve the workspace with a local static server. Use the in-app browser selected for Codex Desktop. Keep the original reference image available for side-by-side comparison.

- [ ] **Step 2: Verify desktop reference fidelity at 1440x900 and 1280x800**

Capture both sizes and check:

```text
- navigation remains 68px and readable
- Agent cockpit remains subordinate to the workspace
- risk list and selected-order detail are visible together
- milestone labels do not overlap
- approval card shows impact and action clearly
- no horizontal viewport overflow
- typography, dividers, status colors, spacing, and density resemble the reference
```

- [ ] **Step 3: Verify compact views at 920x1080 and 440x1024**

At 920 pixels, verify the Agent cockpit can open and close over the workspace. At 440 pixels, verify triage remains usable for risk selection, task status, autonomy visibility, and approval; document that full ERP authoring is desktop-only in V1.

- [ ] **Step 4: Verify interactions and console health**

Exercise this exact path:

```text
跟单 → select SO-2026-0831 → 财务 tab → 交付全景 tab → open R3 approval → approve → open app drawer → inspect MES contract probe → close drawer → submit a command → switch to CRM → return to 跟单
```

Expected: state updates are visible, no control becomes unreachable, no uncaught error appears, and the current order state remains coherent.

- [ ] **Step 5: Write the QA report**

Record in `prototype/design-qa.md`:

```markdown
# Prototype Design QA

## Source
- Reference: `D:/WorkProject/trade-saas/docs/订单交付监控塔.png`
- Target: `prototype/index.html`

## Automated checks
## Viewport results
## Interaction results
## Console results
## Accessibility checks
## Known prototype limitations
```

Only record checks actually performed. Do not describe unverified behavior as passed.

- [ ] **Step 6: Re-run tests and diff checks**

Run:

```powershell
node --test tests/prototype-contract.test.mjs
git diff --check
$unfinished = @('T'+'BD', 'T'+'ODO', 'FIX'+'ME', 'lorem'+' ipsum', '待'+'补充', '占位'+'内容')
Select-String -Path docs/agent-enterprise-application-platform-prd.md, prototype/index.html, prototype/design-qa.md -Pattern $unfinished
```

Expected: all tests PASS; diff check has no output; placeholder scan has no output.

- [ ] **Step 7: Commit verified prototype evidence**

```powershell
git add -- prototype/index.html prototype/design-qa.md
git commit -m "docs: record agent platform prototype QA"
```

## Task 6: Final delivery verification

**Files:**
- Read: `docs/agent-enterprise-application-platform-prd.md`
- Read: `prototype/index.html`
- Read: `prototype/design-qa.md`

- [ ] **Step 1: Verify repository state and final artifacts**

Run:

```powershell
git status --short
git log --oneline -6
Get-Item docs/agent-enterprise-application-platform-prd.md, prototype/index.html, prototype/design-qa.md | Select-Object FullName, Length, LastWriteTime
```

Expected: working tree is clean; commits for PRD, contract, HTML shell, interactions, and QA are present; all three deliverables exist and have non-zero length.

- [ ] **Step 2: Hand off clickable artifacts and verified scope**

Report the PRD path, HTML path, design QA path, automated-test count, verified viewport sizes, verified interaction path, and any remaining prototype-only limitations. State explicitly that the HTML is a product prototype, not a production ERP implementation.
