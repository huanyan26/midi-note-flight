# 🎵 NOTE FLIGHT — MIDI 音符动画生成器

> 将 MIDI 文件转换为视觉化的音符飞行动画，每个音符从画布中央飞向四周边界，在命中瞬间触发音频演奏。

[![Version](https://img.shields.io/badge/version-1.3.2--b-blue)](https://github.com/huanyan26/midi-note-flight)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## 🎬 效果预览

打开 `1.3.2-b-optimized.html` 即可在浏览器中直接运行。导入 MIDI 文件后，音符将以彩色三角形形式从画面中央生成，飞向四周边界（每个音轨对应一个方向），命中边界时触发 Tone.js 音频合成并产生粒子爆炸特效。

## ✨ 核心特性

### 🚀 v1.3.2-b 性能优化版

| 特性 | 说明 |
|------|------|
| **Web Worker 异步解析** | 大 MIDI 文件（>0.5MB）在 Worker 线程解析，主线程零阻塞 |
| **swap-remove 渲染** | O(1) 数组删除替代 splice O(n)，大量对象时帧率提升 2-5x |
| **分帧生成调度** | 音符和粒子按帧限制生成数量，避免单帧尖峰卡顿 |
| **动态对象池** | 三角形/粒子对象池按需自动扩容，消除 GC 压力 |
| **LOD 细节层次** | 低 FPS 时自动跳过远距离三角形和粒子绘制 |
| **自适应性能降级** | 追踪最近 30 帧 FPS，4 级自动降级保证流畅度 |
| **音频抢占调度** | 限制每帧触发音符数和全局复音数，防止爆音 |
| **离屏 Canvas 缓存** | 背景网格和边界预渲染到离屏 Canvas，减少每帧绘制量 |

### 🏗️ 架构亮点

- **四叉树空间分区** — 空间查询 O(log n)，支持可配置容量和深度
- **对象池复用系统** — FlyingTriangle + Particle 双池，消除高频 GC
- **Proxy-based 状态管理** — Zustand-like 响应式状态，自动通知订阅者
- **高精度音频同步** — Tone.Transport 作为主时钟，100ms 漂移检测自动修正
- **IndexedDB 存储** — 大文件持久化存储，支持乐曲列表管理
- **MIDI 2.0 UMP 支持** — 兼容新一代 MIDI 格式

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| **HTML5 Canvas** | 2D 渲染引擎，`desynchronized` 模式降低延迟 |
| **Tone.js 14.8** | Web Audio 音频合成与高精度时序调度 |
| **Tailwind CSS 3.x** | 响应式 UI 框架 |
| **Web Worker** | 异步 MIDI 解析，避免主线程阻塞 |
| **IndexedDB** | 大文件本地持久化存储 |
| **QuadTree** | 自定义空间分区索引算法 |
| **Proxy Store** | ES6 Proxy 响应式状态管理 |

## 📦 快速开始

1. **克隆仓库**
   ```bash
   git clone https://github.com/huanyan26/midi-note-flight.git
   cd midi-note-flight
   ```

2. **打开文件**
   - 直接用浏览器打开 `1.3.2-b-optimized.html`
   - 或使用任意 HTTP 服务器：
     ```bash
     python3 -m http.server 8080
     # 然后访问 http://localhost:8080/1.3.2-b-optimized.html
     ```

3. **导入 MIDI 文件**
   - 点击「导入 MIDI 文件」按钮
   - 支持 `.mid`、`.midi`、`.midi2` 格式
   - 推荐从 [MIDIshow](https://www.midishow.com) 获取 MIDI 资源

4. **播放控制**
   - <kbd>Space</kbd> — 播放/暂停
   - <kbd>R</kbd> — 重置
   - <kbd>Esc</kbd> — 返回乐曲列表

## ⚙️ 设置选项

| 选项 | 说明 |
|------|------|
| **主音量** | 0-100% 全局音量控制 |
| **自动播放** | 加载乐曲后自动开始播放 |
| **高精度音频同步** | 启用 Tone.Transport 作为主时间源 |
| **空间分区索引** | 启用四叉树空间查询 |
| **对象池复用** | 启用对象池减少 GC |
| **显示性能面板** | 实时显示 FPS/对象数/池状态/音频漂移 |
| **时间/BPM 统计** | 显示当前时间、BPM、活跃音符数 |
| **音轨面板** | 显示各音轨的详细信息 |

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `1.3.2-a-optimized.html` | 原始版本（四叉树 + 对象池 + MIDI 2.0） |
| `1.3.2-b-optimized.html` | **性能优化版**（Web Worker + swap-remove + LOD + 自适应降级） |

## 🎹 工作原理

```
MIDI 文件 → EnhancedMidiParser / Web Worker → 音符列表
                                                    ↓
                                            prepareNotes()
                                            (排序 + 时间映射)
                                                    ↓
                                            renderLoop (60fps)
                                            ┌─────────────────┐
                                            │ 分帧生成音符      │
                                            │ 更新三角形位置     │
                                            │ 命中检测 → 音频    │
                                            │ 粒子爆炸特效      │
                                            │ swap-remove 清理  │
                                            │ LOD 降级判断      │
                                            └─────────────────┘
                                                    ↓
                                            Canvas 2D 绘制
                                            (离屏缓存 + 直接绘制)
```

## 🎯 性能优化对比

| 场景 | v1.3.2-a | v1.3.2-b | 提升 |
|------|----------|----------|------|
| 大文件解析（5MB+） | 主线程阻塞 3-8s | Worker 异步，UI 不卡 | ∞ |
| 200+ 活跃三角形 | splice 导致帧率下降 | swap-remove 稳定 60fps | 2-5x |
| 粒子爆发（密集段落） | 单帧全部生成，掉帧 | 分帧限制，平滑过渡 | 3x |
| 低端设备 | 无降级，持续掉帧 | 4 级自适应降级 | 可用性↑ |

## 📝 更新日志

### v1.3.2-b (2026-07-04)
- Web Worker 异步 MIDI 解析（主线程零阻塞）
- 渲染循环 swap-remove（消除 splice O(n) 数组重排）
- 粒子分帧处理 + 动态对象池扩容
- 音频抢占调度（限制复音/防止爆音）
- LOD 细节层次（屏幕外/远距离降级）
- 自适应性能降级系统（4级 FPS 追踪）
- DOM 更新降频至 200ms
- 修复时间/BPM 面板开关同步问题
- 修复计时器在 reset 后的显示错误

### v1.3.2-a (2026-04-19)
- 四叉树空间分区索引系统
- FlyingTriangle + Particle 对象池
- Tone.Transport 高精度音频同步
- MIDI 2.0 UMP 格式支持
- IndexedDB 大文件存储
- PWA 离线支持
- Proxy-based 状态管理

## 👤 作者

**huanyan26** — [huanyan26@qq.com](mailto:huanyan26@qq.com)

## 📄 许可证

MIT License — 详见 [LICENSE](LICENSE)
