# dsh-web-whale-maid (DSH 桌面宠物 · 深海鲸鱼女仆)

[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.md) | **简体中文**

为 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web 界面定制的动态交互式桌面宠物插件 —— **傲娇深海鲸鱼女仆**。

支持大模型实时思考与动作联动、30,000 Token 饱腹度系统、长驻对话气泡、移动端全自适应缩放储物橱柜、近 5 小时任务记忆手账与双层持久化存储。

---

## ✨ 核心特性

- **8 种动作状态帧动画**：
  - `idle`（自然待机）、`hungry`（摸肚讨饭）、`happy`（满心欢喜）、`angry`（傲娇叉腰）、`eating`（捧碗大快朵颐）、`scared`（慌张冷汗发抖）、`sad`（委屈揉眼叹气）、`thinking`（托腮沉思）。
  - 基于高精度 1024x2048 像素精灵图，经过绿幕色度键与自适应溢色消除（Despill）算法处理，在视网膜屏幕上边缘干净丝滑。
- **动作与大模型调用严格联动**：
  - 只有大模型调用会改变桌宠动作状态，其余时间严格维持当前状态。
  - **思考动画联动**：只要开始调用大模型（投喂或任务完成），桌宠立刻切换为 `thinking` 托腮思考动作；当大模型生成结果后，桌宠才切换为大模型指定的心情动作并展示气泡。
- **双区域独立触控与长驻气泡**：
  - **长驻气泡**：大模型对话气泡与动作永久停留在屏幕上，绝不会自动淡出消失。
  - **点击桌宠本体**：唤出复古欧式女仆储物橱柜菜单。
  - **点击说话气泡**：气泡立即关闭，同时桌宠瞬间恢复日常自然的待机动作（`idle`）。
- **饱腹度储备池系统（Token 作为粮食）**：
  - 最大储备池为 **30,000 Token**。
  - 货架提供四档米饭投喂：
    - `一粒米饭`（+1 Token）
    - `一勺米饭`（+1,000 Token）
    - `一碗米饭`（+3,000 Token）
    - `一锅米饭`（+10,000 Token）
  - 实时反映 5 级饱腹感知状态（`快要饿死了！` < 2000、`很饿！` 2000-5000、`不饿，但是不介意吃多点！` 5000-10000、`饱腹满足` 10000-20000、`吃得有点撑了！` > 20000）。
- **体型与气泡大小统一调节滑块**：
  - 橱柜底部抽屉内置**体型与气泡大小**连续调节滑块（支持 50% ~ 180% 范围调节，步长 5%）。
  - 桌宠本体与对话气泡完全同步等比缩放，位置、字号与间距完美自适应。
  - 支持实时百分比数值展示与一键“重置”至 100% 默认尺寸，缩放数值自动持久化保存。
- **通用模型自动同步与动态发现**：
  - 自动读取并同步宿主 `~/.dsh/settings.yaml` 中配置的全部提供商与模型（支持自定义代理、OpenAI 兼容、Ollama、Claude 等），以及 DeepSeek 官方原生模型系列。
  - 自动识别用户在 DSH 设置中指定的默认主模型（`agent-default-model`）作为初始选中项，每次打开橱柜时自动进行热重载，即配即用，零本机硬编码。
- **移动端全自适应储物橱柜**：
  - 在手机移动端（竖屏 / 窄屏）环境下，橱柜面板自动根据屏幕视口安全区域等比缩小居中显示，彻底解决边缘溢出与截断问题；在 PC 桌面端保持原始尺寸。
  - **投喂秒关**：点击货架任意米饭投喂后，橱柜面板立即自动关闭，无需手动点关闭即可直接观看屏幕上桌宠的沉思与发言！
  - 触控延迟优化，发言手账支持移动端丝滑惯性滚动。
- **发言手账与双层数据持久化**：
  - 记录最近 20 条大模型互动手账，包含动作、发言内容、消耗 Token 及时间。
  - 采用本地磁盘存储（`pet_durable_memory.json`）与浏览器 `localStorage` 双层同步机制，页面刷新、重启进程或切换设备均能完整读取与保留饱腹度、当前选定模型与历史手账。
- **上下文感知与严格约束**：
  - 自动感知近 5 小时内主人在 DSH 环境中完成的工作任务，拒绝复读机式回复。
  - **全程严格禁止任何 Emoji 表情**，严格单行 JSON 输出，字数控制在 25 字以内，性格可爱略带傲娇。

---

## 📦 安装方法

### 方法 1：直接让你的 DSH Agent 安装（最简便 🤖）

直接在 DSH 网页对话框中把本仓库地址发送给 Agent：
> “帮我安装这个插件：https://github.com/AcidGr/dsh-web-whale-maid”

DSH 智能体将自动为你配置并加载插件。

### 方法 2：DSH CLI 命令行安装（推荐）

在宿主机终端中执行：

```sh
dsh plugin --profile web add dsh-web-whale-maid
```

（或直接从 GitHub 安装）：

```sh
dsh plugin --profile web add github:AcidGr/dsh-web-whale-maid
```

安装完成后，刷新浏览器页面即可看到桌宠。

### 方法 3：手动离线安装

```sh
PROFILE="${DSH_HOME:-$HOME/.dsh}/profiles/web"
mkdir -p "$PROFILE/plugins" "$PROFILE/node_modules/@dsh-profile"
cp -r dsh-web-whale-maid "$PROFILE/plugins/whale-maid"
ln -sfn ../../plugins/whale-maid "$PROFILE/node_modules/@dsh-profile/whale-maid"

# 追加至 $PROFILE/cordis.patch.yml:
# - insert:
#     - id: whale-maid
#       name: '@dsh-profile/whale-maid'
```

---

## 🎮 使用与交互说明

1. **拖拽移动**：鼠标按住桌宠本体或手机长按小鲸鱼女仆拖拽，即可停靠在屏幕任意位置，自动保存位置记录。
2. **打开储物柜**：轻触 / 单击小鲸鱼女仆身体，开启“女仆储物橱柜”。
   - 顶部货架查看当前饱腹度储备池与饱腹状态。
   - 中间货架点击米饭投喂，面板秒关并触发进食思考。
   - 底部货架可随时切换配置投喂的大模型，并可翻阅或清空“发言手账”。
3. **工作陪伴**：在 DSH 进行代码编写与任务执行时，每当一个工作会话执行完毕，小鲸鱼女仆会结合近 5 小时任务记录与饱腹度，进入思考并给出贴心评价。
4. **消除气泡**：点击说话气泡本身，即可关闭气泡并将桌宠一键重置回自然待机（`idle`）状态。

---

## 📂 项目结构

```
dsh-web-whale-maid/
├── assets/
│   ├── pet_assets.json      # 内置 base64 资产包（精灵图与橱柜）
│   ├── pet_sprite.png       # 8 动作高清重制精灵图（1024x2048）
│   ├── cupboard_bg.png      # 复古欧式储物橱柜背景图（640x580）
│   └── rice_*.png           # 4 档米饭食物图元
├── cordis.patch.yml         # DSH Cordis 挂载声明
├── lib/
│   ├── index.js             # Host 端：LLM 调度、排队队列、持久化读写
│   └── client.js            # Client 端：动画渲染、触控交互、移动端缩放
├── package.json             # npm 包元数据及 DSH 规范配置
├── LICENSE                  # MIT 开源许可证
├── README.md                # 英文说明文档
└── README.zh.md             # 中文说明文档
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源。
