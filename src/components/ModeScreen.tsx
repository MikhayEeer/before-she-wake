import {
  ArrowRight,
  BookOpen,
  Globe2,
  MonitorSmartphone,
  Play,
  RotateCcw,
  Users,
} from 'lucide-react'
import { CardArt } from './CardArt'

interface ModeScreenProps {
  hasLocalSave: boolean
  onOnline: () => void
  onLocal: () => void
  onResumeLocal: () => void
  onOpenRules: () => void
}

export function ModeScreen({
  hasLocalSave,
  onOnline,
  onLocal,
  onResumeLocal,
  onOpenRules,
}: ModeScreenProps) {
  return (
    <main className="setup-screen mode-screen">
      <header className="setup-header mode-header">
        <div>
          <p className="eyebrow">圣莉莉女子学院 · 旧校舍</p>
          <h1>冰冷的她醒来之前</h1>
          <p className="setup-story">
            救援迟迟未至。天亮时，一名同伴已经没有呼吸。有限的材料、彼此的猜疑，以及藏在队伍里的真相，都必须在她醒来之前处理完毕。
          </p>
        </div>
        <CardArt src="/images/corpse.webp" alt="旧校舍中央场景" variant="scene" />
      </header>

      {hasLocalSave && (
        <section className="resume-band mode-resume" aria-label="本地未完成对局">
          <div>
            <span className="status-dot" />
            <strong>本地对局尚未结束</strong>
            <span>可继续上次进度</span>
          </div>
          <button type="button" className="primary-button" onClick={onResumeLocal}>
            <Play size={17} fill="currentColor" aria-hidden="true" />
            继续本地对局
          </button>
        </section>
      )}

      <section className="setup-workspace mode-workspace" aria-labelledby="mode-title">
        <div className="setup-controls mode-controls">
          <div className="section-heading">
            <div>
              <p className="eyebrow">游玩方式</p>
              <h2 id="mode-title">选择如何进入旧校舍</h2>
            </div>
            <Users size={19} aria-hidden="true" />
          </div>

          <div className="mode-choice-list">
            <button type="button" className="mode-choice mode-choice--online" onClick={onOnline}>
              <span className="mode-choice__icon"><Globe2 aria-hidden="true" /></span>
              <span className="mode-choice__body">
                <strong>在线联机</strong>
                <small>创建或加入房间，每位玩家使用自己的手机或电脑</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>

            <button type="button" className="mode-choice" onClick={onLocal}>
              <span className="mode-choice__icon"><MonitorSmartphone aria-hidden="true" /></span>
              <span className="mode-choice__body">
                <strong>本地同屏</strong>
                <small>同一设备轮流查看手牌，可加入基础电脑玩家</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </button>
          </div>

          <button type="button" className="text-button mode-rules-button" onClick={onOpenRules}>
            <BookOpen size={17} aria-hidden="true" />
            查看完整规则
          </button>
        </div>

        <aside className="setup-brief mode-brief" aria-label="模式说明">
          <p className="eyebrow">推荐模式</p>
          <h2>各自持有秘密</h2>
          <p>
            在线房间支持 3 至 6 名玩家。手牌和私人线索只会发送到对应玩家的设备，公开行动会同步给房间内所有人。
          </p>
          <div className="brief-rule">
            <span>在线联机</span>
            <strong>独立手牌 · 实时同步</strong>
          </div>
          <p className="mode-local-note">
            本地模式无需服务器，适合规则测试或在一台设备上传递游玩。
          </p>
          {hasLocalSave && (
            <button type="button" className="text-button" onClick={onResumeLocal}>
              <RotateCcw size={16} aria-hidden="true" />
              恢复本地记录
            </button>
          )}
        </aside>
      </section>
    </main>
  )
}
