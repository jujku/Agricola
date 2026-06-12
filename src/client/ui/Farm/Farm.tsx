import type { PlayerState } from "../../../state/PlayerState";
import {
  BoarIcon,
  CattleIcon,
  ClayIcon,
  FamilyMemberIcon,
  FieldIcon,
  GrainIcon,
  PastureIcon,
  SheepIcon,
  StableIcon,
  StoneIcon,
  VegetableIcon,
  WoodIcon,
} from "../VisualSystem/ResourceIcons";

interface FarmProps {
  player: PlayerState | null;
  isOwnFarm: boolean;
  playerColor?: string;
}

type FarmCellView = PlayerState["farm"]["cells"][number];

export function Farm({ player, isOwnFarm, playerColor = "#C84040" }: FarmProps) {
  const workersAtHome = player?.workers.filter((worker) => worker.location === "home").length ?? 0;

  return (
    <section className={`player-farm ${isOwnFarm ? "player-farm--own" : ""}`}>
      <header className="player-farm__header">
        <div>
          <h2>{player ? `${player.name} 的农场` : "玩家农场"}</h2>
          <span>5列 x 3行</span>
        </div>
        {isOwnFarm ? <strong>我的农场</strong> : null}
      </header>

      {!player ? (
        <p className="muted">暂无玩家农场。</p>
      ) : (
        <>
          <div className="player-farm__frame">
            <div className="player-farm__grid">
              {Array.from({ length: 3 }, (_, row) =>
                Array.from({ length: 5 }, (_, col) => {
                  const cell = player.farm.cells.find((item) => item.row === row && item.col === col);
                  return <FarmTile key={`${row}-${col}`} cell={cell} row={row} col={col} playerColor={playerColor} workersAtHome={workersAtHome} />;
                }),
              )}
            </div>
          </div>

          <footer className="player-farm__legend">
            <LegendSwatch className="empty" label="空地" />
            <LegendSwatch className="room" label="房间" />
            <LegendSwatch className="field" label="田地" />
            <LegendSwatch className="pasture" label="牧场" />
          </footer>
        </>
      )}
    </section>
  );
}

function FarmTile({
  cell,
  row,
  col,
  playerColor,
  workersAtHome,
}: {
  cell?: FarmCellView;
  row: number;
  col: number;
  playerColor: string;
  workersAtHome: number;
}) {
  const state = getCellState(cell);
  const showWorker = Boolean(cell?.room && col === 0 && (row === 1 || row === 2) && workersAtHome > (row === 1 ? 0 : 1));

  return (
    <div className={`farm-tile farm-tile--${state}`} aria-label={`farm[${col}][${row}] ${state}`}>
      <TileContent cell={cell} playerColor={playerColor} state={state} showWorker={showWorker} />
      <small>
        {col},{row}
      </small>
    </div>
  );
}

function TileContent({ cell, playerColor, state, showWorker }: { cell?: FarmCellView; playerColor: string; state: string; showWorker: boolean }) {
  if (!cell || state === "empty") {
    return (
      <div className="farm-tile__empty">
        <span />
      </div>
    );
  }

  if (state === "room") {
    const Icon = cell.roomMaterial === "clay" ? ClayIcon : cell.roomMaterial === "stone" ? StoneIcon : WoodIcon;
    return (
      <div className={`farm-tile__room farm-tile__room--${cell.roomMaterial ?? "wood"}`}>
        <span>{translateRoom(cell.roomMaterial)}</span>
        <Icon size={24} />
        {showWorker ? <FamilyMemberIcon className="farm-tile__worker" color={playerColor} size={18} /> : null}
      </div>
    );
  }

  if (state === "field") {
    return (
      <div className="farm-tile__field">
        <span>田地</span>
        {cell.field?.crop ? (
          <div className="farm-tile__stack">
            {cell.field.crop === "grain" ? <GrainIcon size={22} /> : <VegetableIcon size={22} />}
            <strong>{cell.field.count}</strong>
          </div>
        ) : (
          <FieldIcon size={22} />
        )}
      </div>
    );
  }

  if (state === "pasture") {
    const AnimalIcon = cell.animal === "boar" ? BoarIcon : cell.animal === "cattle" ? CattleIcon : SheepIcon;
    return (
      <div className="farm-tile__pasture">
        <span>牧场</span>
        {cell.animal ? (
          <div className="farm-tile__stack">
            <AnimalIcon size={22} />
            <strong>{cell.animal}</strong>
          </div>
        ) : (
          <PastureIcon size={22} />
        )}
        {cell.stable ? <StableIcon className="farm-tile__stable" size={15} /> : null}
      </div>
    );
  }

  return (
    <div className="farm-tile__standalone">
      <StableIcon size={30} />
      <span>马厩</span>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span>
      <i className={className} />
      {label}
    </span>
  );
}

function getCellState(cell?: FarmCellView): "empty" | "room" | "field" | "pasture" | "stable" {
  if (!cell) return "empty";
  if (cell.room) return "room";
  if (cell.field) return "field";
  if (cell.pastureId) return "pasture";
  if (cell.stable) return "stable";
  return "empty";
}

function translateRoom(material: FarmCellView["roomMaterial"]): string {
  if (material === "clay") return "黏土房";
  if (material === "stone") return "石屋";
  return "木屋";
}
