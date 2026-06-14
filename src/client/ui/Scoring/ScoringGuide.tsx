import { useState } from "react";
import { scoringRules } from "../../../config/scoringRules";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";

type GuideMetric = {
  id: string;
  label: string;
  icon: ResourceIconKey;
  unit: string;
};

type FixedGuideChip = {
  count: string;
  points: number | string;
  note?: string;
};

type FixedGuideRow = {
  id: string;
  label: string;
  icon: ResourceIconKey;
  chips: FixedGuideChip[];
};

const guideMetrics: GuideMetric[] = [
  { id: "fields", label: "田地", icon: "field", unit: "块" },
  { id: "pastures", label: "牧场", icon: "pasture", unit: "个" },
  { id: "grain", label: "谷物", icon: "grain", unit: "个" },
  { id: "vegetables", label: "蔬菜", icon: "vegetable", unit: "个" },
  { id: "sheep", label: "羊", icon: "sheep", unit: "只" },
  { id: "boar", label: "野猪", icon: "boar", unit: "只" },
  { id: "cattle", label: "牛", icon: "cattle", unit: "头" },
];

const fixedGuideRows = [
  {
    id: "rooms",
    label: "房屋",
    icon: "house",
    chips: [
      { count: "木屋 × 1", points: 0 },
      { count: "瓦房 × 1", points: 1 },
      { count: "石屋 × 1", points: 2 },
    ],
  },
  {
    id: "family",
    label: "家庭成员",
    icon: "family",
    chips: [{ count: "成员 × 1", points: 3 }],
  },
  {
    id: "fencedStables",
    label: "牧场内马厩",
    icon: "stable",
    chips: [{ count: "马厩 × 1", points: 1, note: "最多 4 分" }],
  },
  {
    id: "majorImprovements",
    label: "大设施",
    icon: "stone",
    chips: [{ count: "卡牌", points: "左下角胜利点" }],
  },
  {
    id: "emptySpaces",
    label: "空地",
    icon: "field",
    chips: [{ count: "未使用格 × 1", points: -1 }],
  },
  {
    id: "beggingCards",
    label: "乞讨卡",
    icon: "begging",
    chips: [{ count: "乞讨卡 × 1", points: -3 }],
  },
] satisfies FixedGuideRow[];

export function ScoringGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className={`score-guide-bar ${expanded ? "expanded" : ""}`} aria-labelledby="score-guide-title">
      <button className="score-guide-header" type="button" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
        <span className="score-guide-header__icon">
          <RESOURCE_ICONS.grain size={24} />
        </span>
        <div>
          <h2 id="score-guide-title">计分说明</h2>
          <p>资源数量与对应胜利点</p>
        </div>
        <strong>{expanded ? "收起" : "展开"}</strong>
      </button>
      {expanded ? (
        <div className="score-guide-list">
          {guideMetrics.map((metric) => (
            <ScoreRangeRow key={metric.id} metric={metric} />
          ))}
          {fixedGuideRows.map((row) => (
            <ScoreFixedRow key={row.id} row={row} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ScoreRangeRow({ metric }: { metric: GuideMetric }) {
  const Icon = RESOURCE_ICONS[metric.icon];
  const rule = scoringRules.find((candidate) => candidate.id === metric.id);

  return (
    <article className="score-guide-row">
      <h3>
        <Icon size={24} />
        {metric.label}
      </h3>
      <div className="score-guide-chips">
        {rule?.ranges.map((range) => (
          <ScoreChip key={`${range.min}-${range.max ?? "more"}`} count={`${formatRange(range.min, range.max)}${metric.unit}`} points={range.points} />
        ))}
      </div>
    </article>
  );
}

function ScoreFixedRow({ row }: { row: FixedGuideRow }) {
  const Icon = RESOURCE_ICONS[row.icon];
  return (
    <article className="score-guide-row">
      <h3>
        <Icon size={24} />
        {row.label}
      </h3>
      <div className="score-guide-chips">
        {row.chips.map((chip) => (
          <ScoreChip key={`${chip.count}-${chip.points}`} count={chip.count} points={chip.points} note={chip.note} />
        ))}
      </div>
    </article>
  );
}

function ScoreChip({ count, note, points }: { count: string; note?: string; points: number | string }) {
  return (
    <span className="score-guide-chip">
      <span>{count}</span>
      <strong>{typeof points === "number" ? `${signed(points)} 分` : points}</strong>
      {note ? <small>{note}</small> : null}
    </span>
  );
}

function formatRange(min: number, max: number | null): string {
  if (max === null) return `${min}+`;
  if (min === max) return `${min}`;
  return `${min}-${max}`;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}
