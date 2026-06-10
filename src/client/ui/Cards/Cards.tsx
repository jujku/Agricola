import type { CardState } from "../../../state/CardState";
import { useGameStore } from "../../store/gameStore";

const emptyCards: CardState[] = [];

export function Cards() {
  const game = useGameStore((state) => state.game);
  const roundCards = game?.roundCards ?? emptyCards;
  const majorImprovements = game?.majorImprovements ?? emptyCards;

  return (
    <section className="panel">
      <h2>[卡] 卡牌</h2>
      {roundCards.length === 0 ? (
        <p className="muted">暂无回合卡。</p>
      ) : (
        <ul className="card-list">
          {roundCards.map((card) => (
            <li key={card.id}>[回] {card.name}</li>
          ))}
        </ul>
      )}
      <h3>主要发展卡</h3>
      <ul className="card-list">
        {majorImprovements.map((card) => (
          <li key={card.id} className={card.purchasedBy ? "muted" : ""}>
            [主] {card.name}（{card.victoryPoints ?? 0}分）{card.purchasedBy ? "已购买" : ""}
          </li>
        ))}
      </ul>
      {game?.phase === "GAME_END" ? (
        <div className="scoreboard">
          <h3>最终得分</h3>
          {game.players.map((player) => (
            <p key={player.id}>
              {player.name}: {player.score?.total ?? 0}
            </p>
          ))}
          <p>胜者：{game.winnerIds.join(", ")}</p>
        </div>
      ) : null}
    </section>
  );
}
