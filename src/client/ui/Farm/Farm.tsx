import type { PlayerState } from "../../../state/PlayerState";

interface FarmProps {
  player: PlayerState | null;
  isOwnFarm: boolean;
}

export function Farm({ player, isOwnFarm }: FarmProps) {
  return (
    <section className="panel">
      <h2>{player ? `${player.name}的农场${isOwnFarm ? "（我）" : ""}` : "农场"}</h2>
      {!player ? (
        <p className="muted">暂无玩家农场。</p>
      ) : (
        <div className="farm-grid">
          {player.farm.cells.map((cell) => (
            <div key={`${cell.row}-${cell.col}`} className={`farm-cell ${cellClass(cell)}`}>
              <span>{cellIcon(cell)}</span>
              <small>
                {cell.row},{cell.col}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type FarmCellView = PlayerState["farm"]["cells"][number];

function cellIcon(cell: FarmCellView): string {
  if (cell.room) return "房";
  if (cell.field?.crop === "grain") return "谷";
  if (cell.field?.crop === "vegetable") return "菜";
  if (cell.field) return "田";
  if (cell.pastureId) return cell.stable ? "牧棚" : "牧";
  if (cell.stable) return "棚";
  return ".";
}

function cellClass(cell: FarmCellView): string {
  if (cell.room) return "room";
  if (cell.field) return "field";
  if (cell.pastureId) return "pasture";
  if (cell.stable) return "stable";
  return "empty";
}
