# 🎵 NOTE FLIGHT — MIDI 音符动画生成器



> 将 MIDI 文件转换为视觉化的音符飞行动画，每个音符从画布中央飞向四周边界，在命中瞬间触发音频演奏。

[![Version](https://img.shields.io/badge/version-1.3.2-green)](https://github.com/huanyan26/midi-note-flight)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)
[![Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://huanyan26.github.io/midi-note-flight/)

## 访问量统计

![Visitor Count](https://count.getloli.com/get/@huanyan26.midi-note-flight?theme=moebooru)

## Demo

**[https://huanyan26.github.io/midi-note-flight/](https://huanyan26.github.io/midi-note-flight/)**

## 核心特性

| 特性 | 说明 |
|------|------|
| **本地文件导入** | 支持 `.mid` `.midi` `.midi2` 格式拖拽或选择导入 |
| **URL 智能导入** | 支持直链与 MIDI 分享页（自动提取内嵌链接），可配置 CORS 代理读取跨域资源 |
| **URL 远程导入** | 输入直链 URL 在线导入 MIDI 文件 |
| **Web Worker 异步解析** | 大 MIDI 文件在 Worker 线程解析，主线程零阻塞 |
| **swap-remove 渲染** | O(1) 数组删除替代 splice O(n)，大量对象时帧率提升 2-5x |
| **分帧生成调度** | 音符和粒子按帧限制生成数量，避免单帧尖峰卡顿 |
| **动态对象池** | 三角形/粒子对象池按需自动扩容 + 硬上限防溢出 |
| **LOD 细节层次** | 低 FPS 时自动跳过远距离三角形和粒子绘制 |
| **自适应性能降级** | 追踪最近 30 帧 FPS，4 级自动降级保证流畅度 |
| **音频抢占调度** | 限制每帧触发音符数和全局复音数，防止爆音 |
| **离屏 Canvas 缓存** | 背景网格和边界预渲染到离屏 Canvas，减少每帧绘制量 |
| **四叉树空间分区** | 空间查询 O(log n) |
| **MIDI 2.0 UMP 支持** | 兼容新一代 MIDI 格式 |
| **IndexedDB 存储** | 大文件本地持久化，支持多首乐曲管理 |
| **PWA 离线支持** | 可安装到桌面，离线使用 |

## 技术栈

| 技术 | 用途 |
|------|------|
| **HTML5 Canvas** | 2D 渲染引擎 |
| **Tone.js 14.8** | Web Audio 音频合成与高精度时序调度 |
| **Tailwind CSS 3.x** | 响应式 UI 框架 |
| **Web Worker** | 异步 MIDI 解析 |
| **Fetch API** | URL 远程导入 MIDI 文件 |
| **IndexedDB** | 大文件本地持久化存储 |
| **QuadTree** | 自定义空间分区索引 |
| **Proxy Store** | ES6 Proxy 响应式状态管理 |

## 快速开始

```bash
git clone https://github.com/huanyan26/midi-note-flight.git
cd midi-note-flight
python3 -m http.server 8080
# 访问 http://localhost:8080
```

## 操作指南

| 操作 | 说明 |
|------|------|
| 选择本地文件 | 从设备导入 MIDI 文件 |
| 输入链接导入 | 输入在线 MIDI 直链导入 |
| <kbd>Space</kbd> | 播放/暂停 |
| <kbd>R</kbd> | 重置 |
| <kbd>Esc</kbd> | 返回乐曲列表 |

> **URL 导入提示**：支持直接链接 MIDI 文件，也支持 MIDI 分享页（自动从网页中提取下载链接）。若遇跨域限制，可在「设置 → 网络」中配置 CORS 代理（如 `https://corsproxy.io/?url={url}`）。

## 项目结构

```
midi-note-flight/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式表
├── js/
│   ├── config.js           # 配置常量 + 自适应配置
│   ├── easings.js          # 缓动函数
│   ├── time-map.js         # MIDI 时间映射
│   ├── store.js            # 状态管理
│   ├── quadtree.js         # 四叉树空间索引
│   ├── objectpool.js       # 对象池系统
│   ├── perf-degrader.js    # 自适应性能降级
│   ├── indexeddb.js        # IndexedDB 存储层
│   ├── midi-parser.js      # MIDI 解析器 + Web Worker
│   ├── audio-engine.js     # 高精度音频引擎
│   ├── entities.js         # 飞行三角形 + 粒子
│   ├── renderer.js         # Canvas 渲染 + 渲染循环
│   ├── ui-controller.js    # 路由/设置/乐曲列表/URL导入
│   └── app.js              # 入口 + PWA
├── .github/workflows/
│   └── deploy.yml          # GitHub Pages 自动部署
├── LICENSE                 # GPL-3.0
└── README.md
```

## 更新日志

### v1.3.2 (2026-07-08)
- 🌐 优化 URL 导入：支持 MIDI 分享页（自动提取内嵌链接）
- 🔗 新增 CORS 代理配置，可读取跨域/非直链资源
- 🛡️ 新增 MIDI 魔术字节校验，过滤伪装成文件的网页

### v1.3.2 (2026-07-05)
- 新增 URL 远程导入 MIDI 文件功能
-  对象池添加硬上限 + WeakSet 防止内存溢出
-  切换歌曲时自动释放音频合成器
-  离屏 Canvas 显式释放加速 GC
-  许可证更新为 GPL-3.0

### v1.3.2 (2026-07-04)
- Web Worker 异步 MIDI 解析
- swap-remove 渲染循环
- 分帧粒子系统 + 动态对象池
- 音频抢占调度
- LOD 细节层次 + 自适应性能降级
- 项目模块化拆分（14 个 JS 模块）
- GitHub Pages 自动部署
- 修复黑屏/频闪/模态框切换问题

### v1.3.2-a (2026-04-19)
- 四叉树空间分区索引
- 对象池复用系统
- Tone.Transport 高精度音频同步
- MIDI 2.0 UMP 格式支持
- IndexedDB 大文件存储
- PWA 离线支持

## 许可证

[GNU General Public License v3.0](LICENSE) — 自由使用、修改和分发，衍生作品须以相同许可证开源。
