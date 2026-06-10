import type { ActionSpaceState } from "../../../state/ActionSpaceState";
import { useGameStore } from "../../store/gameStore";
import { ActionSpace } from "../ActionSpace/ActionSpace";

const emptyActionSpaces: ActionSpaceState[] = [];

export function Board() {
  const actionSpaces = useGameStore((state) => state.game?.actionSpaces) ?? emptyActionSpaces;

  return (
    <section className="panel">
      <h2>[公] 公共行动区</h2>
      <div className="action-space-grid">
        {actionSpaces.length === 0 ? (
          <p className="muted">暂无行动格。</p>
        ) : (
          actionSpaces.map((actionSpace) => <ActionSpace key={actionSpace.id} actionSpace={actionSpace} />)
        )}
      </div>
    </section>
  );
}
