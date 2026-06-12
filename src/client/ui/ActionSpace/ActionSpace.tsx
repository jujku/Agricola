import type { ActionSpaceState } from "../../../state/ActionSpaceState";
import { FamilyMemberIcon, RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";

interface ActionSpaceProps {
  actionSpace: ActionSpaceState;
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

export function ActionSpace({ actionSpace, isInteractive = false, occupiedColor = "#3A7AC8", onExecute }: ActionSpaceProps) {
  const category = getActionCategory(actionSpace);
  const iconType = getActionIcon(actionSpace);
  const Icon = RESOURCE_ICONS[iconType];
  const accumulated = Object.entries(actionSpace.accumulated).filter((entry): entry is [ResourceIconKey, number] =>
    isResourceIcon(entry[0]) && entry[1] > 0,
  );
  const gains = Object.entries(actionSpace.gain).filter((entry): entry is [ResourceIconKey, number] => isResourceIcon(entry[0]) && entry[1] > 0);
  const isBlocked = actionSpace.type === "placeholder";
  const variant = isBlocked ? "blocked" : actionSpace.occupiedBy ? "occupied" : "normal";

  return (
    <button
      className={`action-card action-card--${variant} action-card--${category} ${isInteractive ? "action-card--interactive" : ""}`}
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
        {actionSpace.prerequisites.length > 0 ? <span className="action-card__tag">条件</span> : null}
      </div>

      <div className="action-card__divider" />

      <section className="action-card__resource-area">
        <span className="action-card__caption">{accumulated.length > 0 ? "累积资源" : "即时收益"}</span>
        <div className="action-card__resources">
          {(accumulated.length > 0 ? accumulated : gains).map(([resource, count]) => {
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
          {accumulated.length === 0 && gains.length === 0 ? <span className="action-card__empty">按规则执行</span> : null}
        </div>
      </section>

      <p className="action-card__rule">{actionSpace.rules[0] ?? actionSpace.restrictions[0] ?? "选择后执行该行动格效果。"}</p>

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
      </footer>
    </button>
  );
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
