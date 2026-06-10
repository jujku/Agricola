import type { PlayerState } from "../../../state/PlayerState";

interface ResourcesProps {
  players: PlayerState[];
}

export function Resources({ players }: ResourcesProps) {
  return (
    <section className="panel">
      <h2>[人] 玩家</h2>
      {players.length === 0 ? (
        <p className="muted">暂无玩家。</p>
      ) : (
        <ul className="player-list">
          {players.map((player) => (
            <li key={player.id} className="player-card">
              <h3>{player.name}</h3>
              <p>工人：{player.workers.length}</p>
              <p>食物：{player.resources.food}</p>
              <p>
                木材 {player.resources.wood} / 黏土 {player.resources.clay} / 芦苇 {player.resources.reed} / 石头 {player.resources.stone}
              </p>
              <p>
                谷物 {player.resources.grain} / 蔬菜 {player.resources.vegetable}
              </p>
              <p>
                羊 {player.animals.sheep} / 野猪 {player.animals.boar} / 牛 {player.animals.cattle}
              </p>
              <p>乞讨卡：{player.beggingCards}</p>
              {player.score ? <p>总分：{player.score.total}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
