import type { ActionSpaceState } from "../../../state/ActionSpaceState";
import { FamilyMemberIcon, RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";

interface ActionSpaceProps {
  actionSpace: ActionSpaceState;
  compact?: boolean;
  isInteractive?: boolean;
  occupiedColor?: string;
  onExecute?: (sourceElement: HTMLElement) => void;
}

type ActionCategory = "resource" | "build" | "farm" | "family" | "improvement";

const CATEGORY_LABEL: Record<ActionCategory, string> = {
  resource: "资源",
  build: "建设",
  farm: "农场",
  family: "家庭",
  improvement: "发展",
};

export function ActionSpace({ actionSpace, compact = false, isInteractive = false, occupiedColor = "#3A7AC8", onExecute }: ActionSpaceProps) {
  const category = getActionCategory(actionSpace);
  const iconType = getActionIcon(actionSpace);
  const Icon = RESOURCE_ICONS[iconType];
  const ruleItems = getActionCardItems(actionSpace);
  const actionSummary = getActionSummary(actionSpace);
  const accumulated = Object.entries(actionSpace.accumulated).filter((entry): entry is [ResourceIconKey, number] => isResourceIcon(entry[0]));
  const gains = Object.entries(actionSpace.gain).filter((entry): entry is [ResourceIconKey, number] => isResourceIcon(entry[0]) && entry[1] > 0);
  const hasAccumulatedResources = accumulated.length > 0;
  const isBlocked = actionSpace.type === "placeholder";
  const variant = isBlocked ? "blocked" : actionSpace.occupiedBy ? "occupied" : "normal";

  return (
    <button
      className={`action-card action-card--${variant} action-card--${category} ${compact ? "action-card--compact" : ""} ${isInteractive ? "action-card--interactive" : ""}`}
      type="button"
      onClick={(event) => onExecute?.(event.currentTarget)}
    >
      <span className="action-card__stripe" aria-hidden="true" />
      <header className="action-card__header">
        <div>
          <h3>{actionSpace.name}</h3>
          <span>{translateActionType(actionSpace.type)}</span>
        </div>
        <Icon size={28} />
      </header>

      <div className="action-card__badge-row">
        <span className="action-card__badge">{CATEGORY_LABEL[category]}</span>
        {actionSpace.prerequisites.length > 0 && !compact ? <span className="action-card__tag">条件</span> : null}
      </div>

      <div className="action-card__divider" />

      <section className="action-card__resource-area">
        <span className="action-card__caption">{hasAccumulatedResources ? "累积资源" : "即时收益"}</span>
        <div className="action-card__resources">
          {(hasAccumulatedResources ? accumulated : gains).map(([resource, count]) => {
            const ResourceIcon = RESOURCE_ICONS[resource];
            return (
              <span key={resource} className="action-card__resource">
                <span data-action-resource={resource}>
                  <ResourceIcon size={24} />
                </span>
                <strong>{count}</strong>
              </span>
            );
          })}
          {!hasAccumulatedResources && gains.length === 0 ? <span className="action-card__empty">按规则执行</span> : null}
        </div>
      </section>

      <ul className={compact ? "action-card__name-list" : "action-card__rule-list"}>
        {ruleItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <footer className="action-card__footer">
        {actionSpace.occupiedBy ? (
          <span className="action-card__worker">
            <FamilyMemberIcon size={22} color={occupiedColor} />
            已占用
          </span>
        ) : isBlocked ? (
          <span className="action-card__unavailable">不可用</span>
        ) : (
          <span className="action-card__button">{isInteractive ? "点击执行" : "需要选择"}</span>
        )}
        <small>{actionSummary}</small>
      </footer>
    </button>
  );
}

function getActionCardItems(actionSpace: ActionSpaceState): string[] {
  const prerequisite = prerequisiteActionDescription(actionSpace);
  if (prerequisite) return [prerequisite];
  const actionNames = getActionNameItems(actionSpace);
  if (actionNames.length > 1) {
    return [`${choicePrefix(actionSpace)}：${actionNames.join("、")}`];
  }
  return [actionNames[0] ?? actionSpace.name];
}

function getActionNameItems(actionSpace: ActionSpaceState): string[] {
  const labels = topLevelEffectLabels(actionSpace.effects).filter(Boolean);
  if (labels.length > 1) {
    return Array.from(new Set(labels));
  }
  return labels.length === 1 && actionSpace.type === "choice" ? labels : [actionSpace.rules[0] ?? actionSpace.name];
}

function topLevelEffectLabels(effects: ActionSpaceState["effects"]): string[] {
  if (effects.length === 1) {
    const [root] = effects;
    if (root && "effects" in root && root.effects) {
      return root.effects.map((effect) => effect.label ?? effectTypeLabel(effect.type));
    }
  }
  return effects.map((effect) => effect.label ?? effectTypeLabel(effect.type));
}

function choicePrefix(actionSpace: ActionSpaceState): string {
  const root = actionSpace.effects[0];
  if (actionSpace.effects.length === 1 && root && "effects" in root && root.effects) {
    if (root.type === "chooseAny") return "可多选";
    if (root.type === "chooseOne") return `${root.effects.length}选一`;
  }
  return `${getActionNameItems(actionSpace).length}选一`;
}

function getActionSummary(actionSpace: ActionSpaceState): string {
  const prerequisite = prerequisiteActionDescription(actionSpace);
  if (prerequisite) return "按顺序执行后续行动。";
  const root = actionSpace.effects[0];
  if (actionSpace.effects.length === 1 && root && "effects" in root && root.effects) {
    return root.type === "chooseAny" ? "点击后选择要执行的行动。" : "点击后选择其中一个行动。";
  }
  if (actionSpace.prerequisites.length > 0) return `条件：${actionSpace.prerequisites[0]}`;
  if (actionSpace.restrictions.length > 0) return actionSpace.restrictions[0];
  return actionSpace.rules[1] ?? actionSpace.rules[0] ?? "确认后执行。";
}

function prerequisiteActionDescription(actionSpace: ActionSpaceState): string | null {
  const root = actionSpace.effects[0];
  if (!(actionSpace.effects.length === 1 && root && "effects" in root && root.effects)) return null;
  const byType = new Map<string, string>(root.effects.map((effect) => [effect.type, effect.label ?? effectTypeLabel(effect.type)]));
  const descriptions = root.effects.flatMap((effect) =>
    (effect.requiresSelectedEffectTypes ?? []).map((requiredType) => {
      const prerequisite = byType.get(requiredType) ?? effectTypeLabel(requiredType);
      const followUp = effect.label ?? effectTypeLabel(effect.type);
      return `${prerequisite}后可${followUp}`;
    }),
  );
  return descriptions.length > 0 ? descriptions.join("；") : null;
}

function effectTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    takeAccumulated: "拿取资源",
    gainResource: "获得资源",
    gainAnimal: "获得动物",
    plowField: "翻田",
    buildRooms: "建房",
    buildStables: "建马厩",
    buildFences: "建围栏",
    sow: "播种",
    bakeBread: "烤面包",
    buyMajorImprovement: "购买大设施",
    playOccupation: "打出职业卡",
    playMinorImprovement: "打出小设施",
    playOccupationPlaceholder: "打出职业卡",
    playMinorImprovementPlaceholder: "打出小设施",
    takeStartingPlayer: "拿起始玩家",
    renovate: "翻修房屋",
    familyGrowth: "生孩子",
    gainMissingAnimal: "增加缺少的动物",
    buildingSupplies: "建筑补给",
    farmingSupplies: "农耕补给",
    sideJob: "副业",
  };
  return labels[type] ?? type;
}

function getActionCategory(actionSpace: ActionSpaceState): ActionCategory {
  const id = actionSpace.id.toLowerCase();
  const text = `${actionSpace.name} ${actionSpace.rules.join(" ")}`.toLowerCase();

  if (id.includes("room") || id.includes("fenc") || id.includes("renov") || text.includes("建") || text.includes("房") || text.includes("栅")) return "build";
  if (id.includes("family") || id.includes("wish") || text.includes("家庭") || text.includes("孩子")) return "family";
  if (id.includes("improvement") || id.includes("lesson") || text.includes("发展") || text.includes("职业")) return "improvement";
  if (id.includes("field") || id.includes("sow") || id.includes("animal") || id.includes("sheep") || id.includes("boar") || id.includes("cattle")) return "farm";
  return "resource";
}

function getActionIcon(actionSpace: ActionSpaceState): ResourceIconKey {
  const resources = { ...actionSpace.accumulated, ...actionSpace.gain };
  const firstResource = Object.keys(resources).find(isResourceIcon);
  if (firstResource) return firstResource;

  const category = getActionCategory(actionSpace);
  if (category === "build") return actionSpace.id.toLowerCase().includes("fenc") ? "fence" : "house";
  if (category === "family") return "family";
  if (category === "farm") return actionSpace.id.toLowerCase().includes("field") ? "field" : "pasture";
  if (category === "improvement") return "stone";
  return "wood";
}

function isResourceIcon(value: string): value is ResourceIconKey {
  return value in RESOURCE_ICONS;
}

function translateActionType(type: string): string {
  const types: Record<string, string> = {
    accumulation: "累积",
    instant: "即时",
    choice: "选择",
    placeholder: "预留",
  };
  return types[type] ?? type;
}
