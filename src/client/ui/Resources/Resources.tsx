import type { PlayerState } from "../../../state/PlayerState";
import type { GameState } from "../../../state/GameState";
import { MajorFacilities } from "../MajorFacilities/MajorFacilities";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";

interface ResourcesProps {
  game: GameState | null;
  isOwnPlayer: boolean;
  player: PlayerState | null;
  roomId: string | null;
}

const RESOURCE_GROUPS: Array<{
  label: string;
  items: Array<{ key: ResourceIconKey; label: string; source: "resources" | "animals" }>;
}> = [
  {
    label: "建筑资源",
    items: [
      { key: "wood", label: "木材", source: "resources" },
      { key: "clay", label: "黏土", source: "resources" },
      { key: "reed", label: "芦苇", source: "resources" },
      { key: "stone", label: "石头", source: "resources" },
    ],
  },
  {
    label: "食物与作物",
    items: [
      { key: "food", label: "食物", source: "resources" },
      { key: "grain", label: "谷物", source: "resources" },
      { key: "vegetable", label: "蔬菜", source: "resources" },
    ],
  },
  {
    label: "动物",
    items: [
      { key: "sheep", label: "羊", source: "animals" },
      { key: "boar", label: "野猪", source: "animals" },
      { key: "cattle", label: "牛", source: "animals" },
    ],
  },
];

export function Resources({ game, isOwnPlayer, player, roomId }: ResourcesProps) {
  return (
    <section className="resource-panel">
      <header className="resource-panel__header">
        <h2>资源</h2>
        {player ? (
          <span className="begging-card-count">
            <RESOURCE_ICONS.begging size={26} />
            <span>乞讨</span>
            {player.beggingCards}
          </span>
        ) : null}
      </header>

      {!player ? (
        <p className="muted">暂无玩家资源。</p>
      ) : (
        <div className="resource-panel__players">
          <article className="resource-player">
            {RESOURCE_GROUPS.map((group) => (
              <section key={group.label} className="resource-group">
                <span>{group.label}</span>
                <div>
                  {group.items.map((item) => (
                    <ResourceToken
                      key={item.key}
                      count={getCount(player, item.key, item.source)}
                      label={item.label}
                      ownerId={player.id}
                      type={item.key}
                    />
                  ))}
                </div>
              </section>
            ))}
            <MajorFacilities game={game} isOwnPlayer={isOwnPlayer} player={player} roomId={roomId} />
          </article>
        </div>
      )}
    </section>
  );
}

function ResourceToken({ count, label, ownerId, type }: { count: number; label: string; ownerId: string; type: ResourceIconKey }) {
  const Icon = RESOURCE_ICONS[type];
  return (
    <span className={`resource-token ${count === 0 ? "resource-token--empty" : ""}`} data-resource={type} data-resource-owner={ownerId} title={label}>
      <Icon size={24} />
      <strong>{count}</strong>
    </span>
  );
}

function getCount(player: PlayerState, key: ResourceIconKey, source: "resources" | "animals"): number {
  if (source === "animals") {
    if (key === "sheep" || key === "boar" || key === "cattle") return player.animals[key];
    return 0;
  }

  if (key === "wood" || key === "clay" || key === "reed" || key === "stone" || key === "grain" || key === "vegetable" || key === "food") {
    return player.resources[key];
  }

  return 0;
}
