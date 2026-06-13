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
                  return <FarmTile key={`${row}-${col}`} cell={cell} player={player} row={row} col={col} playerColor={playerColor} workersAtHome={workersAtHome} />;
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
  player,
  row,
  col,
  playerColor,
  workersAtHome,
}: {
  cell?: FarmCellView;
  player: PlayerState;
  row: number;
  col: number;
  playerColor: string;
  workersAtHome: number;
}) {
  const state = getCellState(cell);
  const showWorker = Boolean(cell?.room && col === 0 && (row === 1 || row === 2) && workersAtHome > (row === 1 ? 0 : 1));

  return (
    <div className={`farm-tile farm-tile--${state}`} style={{ ["--player-color" as string]: playerColor }} aria-label={`farm[${col}][${row}] ${state}`}>
      <TileContent cell={cell} player={player} playerColor={playerColor} state={state} showWorker={showWorker} />
      <FenceLines player={player} row={row} col={col} />
      <small>
        {col},{row}
      </small>
    </div>
  );
}

function TileContent({ cell, player, playerColor, state, showWorker }: { cell?: FarmCellView; player: PlayerState; playerColor: string; state: string; showWorker: boolean }) {
  if (!cell || state === "empty") {
    return (
      <div className="farm-tile__empty">
        <span />
      </div>
    );
  }

  if (state === "room") {
    const Icon = cell.roomMaterial === "clay" ? ClayIcon : cell.roomMaterial === "stone" ? StoneIcon : WoodIcon;
    const houseAnimal = player.farm.animalHousing.house.animal;
    const HouseAnimalIcon = houseAnimal === "boar" ? BoarIcon : houseAnimal === "cattle" ? CattleIcon : SheepIcon;
    return (
      <div className={`farm-tile__room farm-tile__room--${cell.roomMaterial ?? "wood"}`}>
        <span>{translateRoom(cell.roomMaterial)}</span>
        {houseAnimal ? (
          <div className="farm-tile__stack">
            <HouseAnimalIcon size={22} />
            <strong>{player.farm.animalHousing.house.count}</strong>
          </div>
        ) : (
          <Icon size={24} />
        )}
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
    const pasture = cell.pastureId ? player.farm.pastures.find((item) => item.id === cell.pastureId) : null;
    const animalCell = player.farm.animalHousing.cells.find((item) => item.row === cell.row && item.col === cell.col);
    const animal = animalCell?.animal ?? pasture?.animalType ?? cell.animal;
    const animalCount = animalCell?.count ?? 0;
    const AnimalIcon = animal === "boar" ? BoarIcon : animal === "cattle" ? CattleIcon : SheepIcon;
    return (
      <div className="farm-tile__pasture">
        <span>牧场</span>
        {animal ? (
          <div className="farm-tile__stack">
            <AnimalIcon size={22} />
            <strong>{animalCount}</strong>
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

function FenceLines({ player, row, col }: { player: PlayerState; row: number; col: number }) {
  const edges = ["top", "right", "bottom", "left"] as const;
  return (
    <>
      {edges.map((edge) =>
        hasFence(player, row, col, edge) ? <span key={edge} className={`farm-tile__fence farm-tile__fence--${edge}`} aria-hidden="true" /> : null,
      )}
    </>
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

function hasFence(player: PlayerState, row: number, col: number, edge: "top" | "right" | "bottom" | "left"): boolean {
  const segment =
    edge === "left"
      ? { orientation: "vertical", row, col }
      : edge === "right"
        ? { orientation: "vertical", row, col: col + 1 }
        : edge === "top"
          ? { orientation: "horizontal", row, col }
          : { orientation: "horizontal", row: row + 1, col };
  return (player.farm.fenceSegments ?? []).some(
    (candidate) => candidate.orientation === segment.orientation && candidate.row === segment.row && candidate.col === segment.col,
  );
}
