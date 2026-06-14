import type { PlayerState } from "../../../state/PlayerState";
import { useGameStore } from "../../store/gameStore";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";
import { getPlayerColorById } from "../VisualSystem/playerColors";

const LOG_ICON_MATCHERS: Array<{ key: ResourceIconKey; words: string[] }> = [
  { key: "wood", words: ["木材", "木头", "木"] },
  { key: "clay", words: ["黏土", "砖头", "砖"] },
  { key: "reed", words: ["芦苇"] },
  { key: "stone", words: ["石头", "石"] },
  { key: "food", words: ["食物", "粮食", "喂食", "喂养"] },
  { key: "grain", words: ["谷物", "小麦"] },
  { key: "vegetable", words: ["蔬菜"] },
  { key: "begging", words: ["乞讨"] },
  { key: "sheep", words: ["羊"] },
  { key: "boar", words: ["野猪"] },
  { key: "cattle", words: ["牛"] },
  { key: "house", words: ["房间", "房屋", "翻修"] },
  { key: "field", words: ["田地", "翻田", "农田", "播种", "收获"] },
  { key: "pasture", words: ["牧场"] },
  { key: "fence", words: ["围栏"] },
  { key: "stable", words: ["马厩", "畜棚"] },
  { key: "family", words: ["家庭成员", "生孩子", "工人"] },
  { key: "starting", words: ["起始玩家"] },
];

export function OperationLog() {
  const game = useGameStore((state) => state.game);
  const players = game?.players ?? [];
  const logs = game?.actionLog ?? [];
  const latestLogs = logs.slice(-40).reverse();

  return (
    <section className="panel operation-log-panel" aria-label="操作记录">
      <header className="operation-log-panel__header">
        <div>
          <h2>操作记录</h2>
          <p className="muted">记录玩家获得、建造和收获。</p>
        </div>
        <span className="operation-log-panel__count">{logs.length}</span>
      </header>

      {latestLogs.length === 0 ? (
        <p className="muted">暂无操作记录。</p>
      ) : (
        <ol className="operation-log-list">
          {latestLogs.map((message, index) => {
            const player = findLogPlayer(players, message);
            const icons = getLogIcons(message);
            return (
              <li
                key={`${logs.length - index}-${message}`}
                className="operation-log-item"
                style={{ ["--player-color" as string]: getPlayerColorById(players, player?.id) }}
              >
                <span className="operation-log-item__marker" aria-hidden="true">
                  {player ? player.name.slice(0, 1) : "记"}
                </span>
                <div className="operation-log-item__body">
                  <p>{message}</p>
                  {icons.length > 0 ? (
                    <div className="operation-log-item__icons" aria-hidden="true">
                      {icons.map((iconKey) => {
                        const Icon = RESOURCE_ICONS[iconKey];
                        return (
                          <span key={iconKey} title={getIconLabel(iconKey)}>
                            <Icon size={22} />
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {game?.phase === "GAME_END" ? (
        <section className="operation-scoreboard" aria-label="最终得分">
          <h3>最终得分</h3>
          {game.players.map((player) => (
            <p key={player.id}>
              <span>{player.name}</span>
              <strong>{player.score?.total ?? 0}</strong>
            </p>
          ))}
          <p>
            <span>胜者</span>
            <strong>{game.winnerIds.map((id) => game.players.find((player) => player.id === id)?.name ?? id).join("、")}</strong>
          </p>
        </section>
      ) : null}
    </section>
  );
}

function findLogPlayer(players: PlayerState[], message: string): PlayerState | null {
  return players.find((player) => message.startsWith(player.name) || message.includes(`玩家${player.name}`)) ?? null;
}

function getLogIcons(message: string): ResourceIconKey[] {
  const icons: ResourceIconKey[] = [];
  LOG_ICON_MATCHERS.forEach(({ key, words }) => {
    if (words.some((word) => message.includes(word)) && !icons.includes(key)) {
      icons.push(key);
    }
  });
  return icons.slice(0, 6);
}

function getIconLabel(key: ResourceIconKey): string {
  const labels: Record<ResourceIconKey, string> = {
    wood: "木材",
    clay: "黏土",
    reed: "芦苇",
    stone: "石头",
    food: "食物",
    grain: "谷物",
    vegetable: "蔬菜",
    begging: "乞讨",
    starting: "起始玩家",
    sheep: "羊",
    boar: "野猪",
    cattle: "牛",
    house: "房屋",
    field: "田地",
    pasture: "牧场",
    fence: "围栏",
    family: "家庭成员",
    stable: "马厩",
  };
  return labels[key];
}
