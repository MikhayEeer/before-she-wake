# before-she-wake

桌游《冰冷的她醒来之前》（Embalming Girl）的本地纯文字 Web 实现。支持 3–6 个席位、同设备隐私交接、电脑玩家、本地自动存档，以及完整的卡牌能力与优先级结算。

本项目不包含原作插画或扫描素材。图像插槽与文件名见 `public/images/README.md`。

## Commands

```bash
npm install
npm run dev -- --host 0.0.0.0
npm test
npm run build
```

## Structure

- `src/game/cards.ts`: 卡牌资料、人数牌组与调和目标
- `src/game/engine.ts`: 纯规则状态机与胜负结算
- `src/game/ai.ts`: 仅使用自身手牌和公开信息的电脑决策
- `src/components`: 设置、桌面、隐私遮罩、规则抽屉

## Rule references

- [Designer rule sheet](https://blog-imgs-137-origin.fc2.com/y/u/o/yuofc2/Embalming_setsumei.jpg)
- [Designer introduction](https://yuofc2.blog72.fc2.com/blog-entry-348.html)
- [BoardGameGeek entry](https://boardgamegeek.com/boardgame/326054/leng-taibi-nu-gamu-jue-meruqian-ni-embalming-girl)

这是供本地游玩与开发验证使用的非官方实现。
