import { useState } from "react";
import { formatRangeText } from "./scoringView";

const guideRows = [
  { id: "fields", label: "田地", rule: formatRangeText("fields") },
  { id: "pastures", label: "牧场", rule: formatRangeText("pastures") },
  { id: "grain", label: "谷物", rule: formatRangeText("grain") },
  { id: "vegetables", label: "蔬菜", rule: formatRangeText("vegetables") },
  { id: "sheep", label: "羊", rule: formatRangeText("sheep") },
  { id: "boar", label: "野猪", rule: formatRangeText("boar") },
  { id: "cattle", label: "牛", rule: formatRangeText("cattle") },
  { id: "rooms", label: "房屋", rule: "木屋0分，黏土房每间1分，石屋每间2分" },
  { id: "family", label: "家庭成员", rule: "每个家庭成员3分" },
  { id: "fencedStables", label: "围栏内马厩", rule: "每个1分，最多4分" },
  { id: "majorImprovements", label: "大设施", rule: "按卡牌左下角胜利点计分" },
  { id: "emptySpaces", label: "空地", rule: "每个未使用农场格-1分" },
  { id: "beggingCards", label: "乞讨卡", rule: "每张-3分" },
];

export function ScoringGuide() {
  const [open, setOpen] = useState(false);

  return (
    <section className="score-guide-bar">
      <button className="score-guide-button" onClick={() => setOpen(true)}>
        计分说明
        <small>查看羊、田地、房屋等如何得分</small>
      </button>
      {open ? (
        <div className="modal-layer" role="dialog" aria-modal="true">
          <section className="game-modal score-guide-modal">
            <span className="game-modal__eyebrow">计分说明</span>
            <h2>分数怎么统计</h2>
            <div className="score-guide-list">
              {guideRows.map((row) => (
                <article key={row.id} className="score-guide-row">
                  <strong>{row.label}</strong>
                  <span>{row.rule}</span>
                </article>
              ))}
            </div>
            <footer className="game-modal__actions">
              <button className="secondary-button" onClick={() => setOpen(false)}>
                关闭
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
