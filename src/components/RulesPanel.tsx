import { BookOpen, X } from 'lucide-react'
import { CARDS } from '../game/cards'

interface RulesPanelProps {
  open: boolean
  onClose: () => void
}

export function RulesPanel({ open, onClose }: RulesPanelProps) {
  if (!open) return null

  return (
    <div className="drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="rules-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer-header">
          <div>
            <p className="eyebrow">规则档案</p>
            <h2 id="rules-title">
              <BookOpen size={20} aria-hidden="true" />
              行动与结算
            </h2>
          </div>
          <button type="button" className="icon-button" title="关闭规则" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="drawer-content">
          <section>
            <h3>回合</h3>
            <p>行动玩家选择 1 张手牌，以以下一种方式处理。犯人不能主动处理。</p>
            <ol className="rule-list">
              <li><strong>调和</strong><span>面朝下放入中央；结算时累计 MP。</span></li>
              <li><strong>质疑</strong><span>面朝下放到另一名玩家面前；结算时累计该玩家的质疑值。</span></li>
              <li><strong>发动</strong><span>面朝上公开角色，并完整结算角色能力。</span></li>
            </ol>
            <p>回合结束后只剩 1 张手牌的玩家退出行动；该牌成为受保护的最终身份，但仍可被质疑。</p>
          </section>

          <section>
            <h3>最终结算</h3>
            <p>调和目标为 <strong>12 − 玩家人数</strong>。质疑值低于 0 时按 0 计算；最高者被监禁，全员并列则无人被监禁。</p>
            <ol className="priority-list">
              <li><span>01</span><div><strong>外星人</strong><p>自己被监禁且不是全员并列。</p></div></li>
              <li><span>02</span><div><strong>感染者</strong><p>调和失败。</p></div></li>
              <li><span>03</span><div><strong>犯人阵营</strong><p>犯人未被监禁；犯人与所有共犯获胜。</p></div></li>
              <li><span>04</span><div><strong>善方身份</strong><p>调和成功。</p></div></li>
              <li><span>05</span><div><strong>归宅部</strong><p>更高优先级均无人获胜。</p></div></li>
            </ol>
          </section>

          <section>
            <h3>电脑玩家</h3>
            <p>电脑玩家使用本地启发式策略，不调用模型，也不会读取其他玩家的手牌、调和暗牌或质疑暗牌。</p>
            <ol className="rule-list">
              <li><strong>保留身份</strong><span>优先留下犯人、外星人、感染者与其他高价值最终身份。</span></li>
              <li><strong>公开判断</strong><span>依据调和牌数量、公开角色、质疑数量与各玩家手牌数量选择行动。</span></li>
              <li><strong>不确定性</strong><span>在合理选项间使用带种子的权重选择，因此同一局可复现但不会每局固定套路。</span></li>
            </ol>
          </section>

          <section>
            <h3>角色索引</h3>
            <div className="role-index">
              {Object.values(CARDS).map((card) => (
                <article key={card.id}>
                  <div>
                    <strong>{card.name}</strong>
                    <span>{card.point > 0 ? '+' : ''}{card.point} MP · 优先 {card.priority}</span>
                  </div>
                  <p>{card.ability}</p>
                  <small>{card.victory}</small>
                </article>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
