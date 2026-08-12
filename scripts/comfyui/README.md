# ComfyUI 卡面/背景生成管线（before-she-wake）

使用本机 D 盘 ComfyUI（Z-Image Turbo 模型，端口 8188）生成《冰冷的她醒来之前》的卡牌角色图和中央场景图。

## 依赖

- ComfyUI 正在运行（`http://127.0.0.1:8188`）。已配好以下模型：
  - diffusion_models: `z_image_turbo_int8_convrot.safetensors`
  - text_encoders: `qwen_3_4b_fp8_mixed.safetensors`
  - vae: `ae.safetensors`
- Node.js（本项目自带）。

## 快速开始

```bash
# 中央场景（text2img，横向）
node scripts/comfyui/generate.mjs --workflow scene --out public/images

# 单张卡牌（text2img，按 prompts.json 的角色提示词）
node scripts/comfyui/generate.mjs --workflow card-text --card student-president --out public/images/cards

# 全部卡牌（批量，可选 --prefix）
for id in student-president health-committee library-committee discipline-committee young-lady news-club class-representative honor-student criminal accomplice alien infected go-home-club; do
  node scripts/comfyui/generate.mjs --workflow card-text --card $id --out public/images/cards
done

# 用本地参考图做 img2img（denoise 越低越贴近参考图，0.5-0.7 适中）
node scripts/comfyui/generate.mjs --workflow card-ref --card young-lady --ref ref/young-lady.jpg --denoise 0.6 --out public/images/cards
```

## 常用参数

| 参数 | 说明 | 默认 |
|---|---|---|
| `--workflow` | `scene` / `card-text` / `card-ref` | `card-text` |
| `--card` | 角色 id（在 prompts.json 中查找提示词） | - |
| `--prompt` | 直接传提示词（覆盖 --card） | - |
| `--ref` | 参考图路径（仅 card-ref） | - |
| `--denoise` | img2img 去噪强度（仅 card-ref） | 0.6 |
| `--seed` | 随机种子（可复现） | 随机 |
| `--steps` | 采样步数 | 8 |
| `--w` / `--h` | 输出尺寸 | 1024×1024 |
| `--out` | 输出目录 | `public/images` |
| `--prefix` | 输出文件名前缀 | `bsw_<card>` |

环境变量 `COMFYUI_URL` 可覆盖 ComfyUI 地址。

## 工作流

- `workflows/scene.json`：背景/场景 text2img（Z-Image Turbo：`res_multistep` / `simple` / 8 步 / cfg 1 / ModelSamplingAuraFlow shift=3）。
- `workflows/card-text.json`：卡牌纯文本生成（无参考图，完全按提示词出图）。
- `workflows/card-ref.json`：卡牌 img2img（`LoadImage → ImageScale → VAEEncode → KSampler`，配合用户本地参考图）。
- `prompts.json`：每个角色的英文提示词（统一「圣莉莉女校 · 夜 · 暗色恐怖」风格），可自行调整。

## 输出与占位

生成图输出为 PNG。将结果放到 `public/images/cards/<id>.png` 与 `public/images/corpse.png` 即可替换 `src/game/cards.ts` 与 `src/components/*` 中的占位图。

## 版权说明

本项目为本地个人实现。原版角色插画为商业桌游版权素材，请勿将抓取或重绘的版权图公开发布。推荐做法：
- 用 `card-ref`（img2img）时，参考图只放你自己本地拥有的素材；
- 或直接用 `card-text` 按提示词生成**原创风格**的角色图，规避版权风险。
