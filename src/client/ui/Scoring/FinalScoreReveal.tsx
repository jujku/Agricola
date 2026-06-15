import { useEffect, useState } from "react";
import type { GameState } from "../../../state/GameState";
import type { ScoreBreakdown } from "../../../state/PlayerState";
import { describeScoreValue, scoreRows, type ScoreKey } from "./scoringView";
import { RESOURCE_ICONS } from "../VisualSystem/ResourceIcons";

interface FinalScoreRevealProps {
  game: GameState;
}

export function FinalScoreReveal({ game }: FinalScoreRevealProps) {
  const [visibleRows, setVisibleRows] = useState(1);
  const [dismissedGameId, setDismissedGameId] = useState<string | null>(null);
  const open = game.phase === "GAME_END" && dismissedGameId !== `${game.gameId}:${game.round}`;
  const rows = scoreRows.filter((row) => row.key !== "minorImprovements" && row.key !== "occupations");
  const completed = visibleRows >= rows.length;

  useEffect(() => {
    if (!open) return;
    setVisibleRows(1);
  }, [open, game.gameId, game.round]);

  useEffect(() => {
    if (!open || completed) return;
    const timer = window.setTimeout(() => setVisibleRows((value) => Math.min(rows.length, value + 1)), 500);
    return () => window.clearTimeout(timer);
  }, [completed, open, rows.length, visibleRows]);

  if (!open) return null;

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal final-score-modal">
        <span className="game-modal__eyebrow">最终结算</span>
        <h2>农场得分</h2>
        <div className="final-score-table">
          <div className="final-score-table__head" style={{ ["--player-count" as string]: game.players.length }}>
            <span>类别</span>
            {game.players.map((player) => (
              <strong key={player.id}>{player.name}</strong>
            ))}
          </div>
          {rows.slice(0, visibleRows).map((row) => (
            <div key={row.key} className="final-score-row" style={{ ["--player-count" as string]: game.players.length }}>
              <strong>
                <RowIcon icon={row.icon} />
                <span>{row.label}</span>
              </strong>
              {game.players.map((player) => (
                <span key={player.id}>
                  <small className="final-score-row__detail">
                    <RowIcon icon={row.icon} size={14} />
                    <span>{describeScoreValue(player, row.key)}</span>
                  </small>
                  <b>{scoreValue(player.score, row.key)}</b>
                </span>
              ))}
            </div>
          ))}
          {completed ? (
            <div className="final-score-row final-score-row--total" style={{ ["--player-count" as string]: game.players.length }}>
              <strong>
                <RowIcon icon="wood" />
                <span>总分</span>
              </strong>
              {game.players.map((player) => (
                <span key={player.id} className={game.winnerIds.includes(player.id) ? "winner" : ""}>
                  <small>{game.winnerIds.includes(player.id) ? "冠军" : "完成"}</small>
                  <b>{player.score?.total ?? 0}</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {completed ? (
          <p className="final-score-winner">冠军：{game.winnerIds.map((id) => game.players.find((player) => player.id === id)?.name ?? id).join("、")}</p>
        ) : (
          <p className="muted">正在逐项结算...</p>
        )}
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={() => setVisibleRows(rows.length)}>
            直接显示
          </button>
          <button onClick={() => setDismissedGameId(`${game.gameId}:${game.round}`)}>关闭</button>
        </footer>
      </section>
    </div>
  );
}

function RowIcon({ icon, size = 18 }: { icon: (typeof scoreRows)[number]["icon"]; size?: number }) {
  const Icon = RESOURCE_ICONS[icon];
  return <Icon size={size} />;
}

function scoreValue(score: ScoreBreakdown | null, key: ScoreKey): number {
  return score?.[key] ?? 0;
}
