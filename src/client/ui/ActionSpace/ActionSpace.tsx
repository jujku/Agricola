import type { ActionSpaceState } from "../../../state/ActionSpaceState";

interface ActionSpaceProps {
  actionSpace: ActionSpaceState;
}

export function ActionSpace({ actionSpace }: ActionSpaceProps) {
  return (
    <article className={actionSpace.occupiedBy ? "action-card occupied" : "action-card"}>
      <h3>[格] {actionSpace.name}</h3>
      <p>类型：{translateActionType(actionSpace.type)}</p>
      <p>占用：{actionSpace.occupiedBy ?? "无"}</p>
      <p>积累：{formatRecord(actionSpace.accumulated)}</p>
    </article>
  );
}

function formatRecord(record: Record<string, number>): string {
  const entries = Object.entries(record).filter(([, value]) => value > 0);
  return entries.length === 0 ? "无" : entries.map(([key, value]) => `${translateResource(key)}:${value}`).join(" ");
}

function translateActionType(type: string): string {
  const types: Record<string, string> = {
    accumulation: "积累",
    instant: "立即",
    choice: "选择",
    placeholder: "预留",
  };
  return types[type] ?? type;
}

function translateResource(resource: string): string {
  const resources: Record<string, string> = {
    wood: "木材",
    clay: "黏土",
    reed: "芦苇",
    stone: "石头",
    grain: "谷物",
    vegetable: "蔬菜",
    food: "食物",
    sheep: "羊",
    boar: "野猪",
    cattle: "牛",
  };
  return resources[resource] ?? resource;
}
