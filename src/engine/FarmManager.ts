import type { ResourceKey } from "../config/baseActions";
import type { CellPosition } from "../shared/types";
import type { FarmCell, FarmState, RoomMaterial } from "../state/FarmState";
import type { PlayerState } from "../state/PlayerState";

export class FarmManager {
  createInitialFarm(): FarmState {
    const cells: FarmCell[] = [];

    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const isInitialRoom = col === 0 && (row === 1 || row === 2);
        cells.push({
          row,
          col,
          room: isInitialRoom,
          roomMaterial: isInitialRoom ? "wood" : null,
          field: null,
          pastureId: null,
          stable: false,
          animal: null,
        });
      }
    }

    return {
      rows: 3,
      cols: 5,
      cells,
      roomMaterial: "wood",
      fencesUsed: 0,
      pastures: [],
    };
  }

  plowField(player: PlayerState, position: CellPosition): PlayerState {
    const cell = this.getCell(player.farm, position);

    if (!this.isEmptyForField(cell)) {
      throw new Error("该农场格不能翻耕为田地。");
    }

    const existingFields = player.farm.cells.filter((candidate) => candidate.field);
    if (existingFields.length > 0 && !this.hasOrthogonalNeighbor(player.farm, position, (candidate) => Boolean(candidate.field))) {
      throw new Error("新田地必须与已有田地正交相邻。");
    }

    return this.updateCell(player, position, {
      ...cell,
      field: {
        crop: null,
        count: 0,
      },
    });
  }

  sow(player: PlayerState, crop: "grain" | "vegetable", positions: CellPosition[]): PlayerState {
    const cropSize = crop === "grain" ? 3 : 2;
    const resource = crop;
    const uniquePositions = this.uniquePositions(positions);

    if (player.resources[resource] < uniquePositions.length) {
      throw new Error("库存作物不足，不能播种。");
    }

    let nextPlayer = {
      ...player,
      resources: {
        ...player.resources,
        [resource]: player.resources[resource] - uniquePositions.length,
      },
    };

    uniquePositions.forEach((position) => {
      const cell = this.getCell(nextPlayer.farm, position);
      if (!cell.field || cell.field.crop !== null || cell.field.count !== 0) {
        throw new Error("只能在空田地播种。");
      }
      nextPlayer = this.updateCell(nextPlayer, position, {
        ...cell,
        field: {
          crop,
          count: cropSize,
        },
      });
    });

    return nextPlayer;
  }

  harvestFields(player: PlayerState): PlayerState {
    let nextPlayer = player;

    player.farm.cells.forEach((cell) => {
      if (!cell.field?.crop || cell.field.count <= 0) {
        return;
      }

      const crop = cell.field.crop;
      nextPlayer = {
        ...nextPlayer,
        resources: {
          ...nextPlayer.resources,
          [crop]: nextPlayer.resources[crop] + 1,
        },
      };
      nextPlayer = this.updateCell(nextPlayer, cell, {
        ...cell,
        field: {
          crop: cell.field.count - 1 > 0 ? crop : null,
          count: cell.field.count - 1,
        },
      });
    });

    return nextPlayer;
  }

  buildRooms(player: PlayerState, positions: CellPosition[]): PlayerState {
    const uniquePositions = this.uniquePositions(positions);
    if (uniquePositions.length === 0) {
      return player;
    }

    uniquePositions.forEach((position) => {
      const cell = this.getCell(player.farm, position);
      if (!this.isEmptyForRoom(cell)) {
        throw new Error("该农场格不能建房间。");
      }
    });
    this.assertNewRoomsAreConnected(player.farm, uniquePositions);

    const material = player.farm.roomMaterial;
    const mainResource: ResourceKey = material === "wood" ? "wood" : material === "clay" ? "clay" : "stone";
    const cost = {
      [mainResource]: uniquePositions.length * 5,
      reed: uniquePositions.length * 2,
    } as Partial<Record<ResourceKey, number>>;
    let nextPlayer = this.pay(player, cost);

    uniquePositions.forEach((position) => {
      const cell = this.getCell(nextPlayer.farm, position);
      nextPlayer = this.updateCell(nextPlayer, position, {
        ...cell,
        room: true,
        roomMaterial: material,
      });
    });

    return nextPlayer;
  }

  buildStables(player: PlayerState, positions: CellPosition[], max: number, woodCost: number): PlayerState {
    const uniquePositions = this.uniquePositions(positions);

    if (uniquePositions.length > max) {
      throw new Error(`一次行动最多建${max}个畜棚。`);
    }

    let nextPlayer = this.pay(player, { wood: uniquePositions.length * woodCost });

    uniquePositions.forEach((position) => {
      const cell = this.getCell(nextPlayer.farm, position);

      if (cell.stable || cell.room || cell.field) {
        throw new Error("该农场格不能建畜棚。");
      }

      nextPlayer = this.updateCell(nextPlayer, position, {
        ...cell,
        stable: true,
      });
    });

    return nextPlayer;
  }

  buildFences(player: PlayerState, positions: CellPosition[]): PlayerState {
    const uniquePositions = this.uniquePositions(positions);
    if (uniquePositions.length === 0) {
      return player;
    }

    if (!this.isConnected(uniquePositions)) {
      throw new Error("牧场必须连续。");
    }

    uniquePositions.forEach((position) => {
      const cell = this.getCell(player.farm, position);
      if (cell.room || cell.field || cell.pastureId) {
        throw new Error("房间、田地或已有牧场不能建为新牧场。");
      }
    });

    const fenceCost = this.countBoundarySegments(uniquePositions);
    if (player.farm.fencesUsed + fenceCost > 15) {
      throw new Error("每个玩家最多15个栅栏。");
    }

    const pastureId = `pasture-${player.farm.pastures.length + 1}`;
    let nextPlayer = this.pay(player, { wood: fenceCost });

    uniquePositions.forEach((position) => {
      const cell = this.getCell(nextPlayer.farm, position);
      nextPlayer = this.updateCell(nextPlayer, position, {
        ...cell,
        pastureId,
      });
    });

    return {
      ...nextPlayer,
      farm: {
        ...nextPlayer.farm,
        fencesUsed: nextPlayer.farm.fencesUsed + fenceCost,
        pastures: [...nextPlayer.farm.pastures, { id: pastureId, cells: uniquePositions }],
      },
    };
  }

  renovate(player: PlayerState): PlayerState {
    const nextMaterial = this.nextRoomMaterial(player.farm.roomMaterial);
    if (!nextMaterial) {
      throw new Error("石屋不能继续翻修。");
    }

    const roomCount = player.farm.cells.filter((cell) => cell.room).length;
    const resource: ResourceKey = nextMaterial === "clay" ? "clay" : "stone";
    const paid = this.pay(player, {
      [resource]: roomCount,
      reed: 1,
    } as Partial<Record<ResourceKey, number>>);

    return {
      ...paid,
      farm: {
        ...paid.farm,
        roomMaterial: nextMaterial,
        cells: paid.farm.cells.map((cell) =>
          cell.room
            ? {
                ...cell,
                roomMaterial: nextMaterial,
              }
            : cell,
        ),
      },
    };
  }

  countRooms(player: PlayerState): number {
    return player.farm.cells.filter((cell) => cell.room).length;
  }

  countEmptyRooms(player: PlayerState): number {
    return this.countRooms(player) - player.workers.length;
  }

  pay(player: PlayerState, cost: Partial<Record<ResourceKey, number>>): PlayerState {
    this.assertCanPay(player, cost);
    const resources = { ...player.resources };
    Object.entries(cost).forEach(([resource, amount]) => {
      resources[resource as ResourceKey] -= amount ?? 0;
    });
    return { ...player, resources };
  }

  assertCanPay(player: PlayerState, cost: Partial<Record<ResourceKey, number>>): void {
    Object.entries(cost).forEach(([resource, amount]) => {
      if (player.resources[resource as ResourceKey] < (amount ?? 0)) {
        throw new Error("资源不足。");
      }
    });
  }

  private updateCell(player: PlayerState, position: CellPosition, cell: FarmCell): PlayerState {
    return {
      ...player,
      farm: {
        ...player.farm,
        cells: player.farm.cells.map((candidate) => (candidate.row === position.row && candidate.col === position.col ? cell : candidate)),
      },
    };
  }

  private getCell(farm: FarmState, position: CellPosition): FarmCell {
    const cell = farm.cells.find((candidate) => candidate.row === position.row && candidate.col === position.col);
    if (!cell) {
      throw new Error("农场格不存在。");
    }
    return cell;
  }

  private isEmptyForField(cell: FarmCell): boolean {
    return !cell.room && !cell.field && !cell.pastureId && !cell.stable;
  }

  private isEmptyForRoom(cell: FarmCell): boolean {
    return !cell.room && !cell.field && !cell.pastureId && !cell.stable;
  }

  private hasOrthogonalNeighbor(farm: FarmState, position: CellPosition, predicate: (cell: FarmCell) => boolean): boolean {
    return farm.cells.some((cell) => Math.abs(cell.row - position.row) + Math.abs(cell.col - position.col) === 1 && predicate(cell));
  }

  private assertNewRoomsAreConnected(farm: FarmState, positions: CellPosition[]): void {
    const newRoomKeys = new Set(positions.map((position) => this.positionKey(position)));
    const touchesExistingRoom = positions.some((position) => this.hasOrthogonalNeighbor(farm, position, (candidate) => candidate.room));

    if (!touchesExistingRoom) {
      throw new Error("新房间必须与现有房间正交相邻。");
    }

    positions.forEach((position) => {
      const touchesRoomGroup = this.hasOrthogonalNeighbor(farm, position, (candidate) => candidate.room || newRoomKeys.has(this.positionKey(candidate)));
      if (!touchesRoomGroup) {
        throw new Error("新房间必须与现有房间正交相邻。");
      }
    });
  }

  private isConnected(positions: CellPosition[]): boolean {
    const keys = new Set(positions.map((position) => this.positionKey(position)));
    const seen = new Set<string>();
    const queue = [positions[0]];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }
      const key = this.positionKey(current);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      [
        { row: current.row - 1, col: current.col },
        { row: current.row + 1, col: current.col },
        { row: current.row, col: current.col - 1 },
        { row: current.row, col: current.col + 1 },
      ].forEach((next) => {
        if (keys.has(this.positionKey(next))) {
          queue.push(next);
        }
      });
    }

    return seen.size === positions.length;
  }

  private countBoundarySegments(positions: CellPosition[]): number {
    const keys = new Set(positions.map((position) => this.positionKey(position)));
    return positions.reduce((sum, position) => {
      const neighbors = [
        `${position.row - 1}:${position.col}`,
        `${position.row + 1}:${position.col}`,
        `${position.row}:${position.col - 1}`,
        `${position.row}:${position.col + 1}`,
      ];
      return sum + neighbors.filter((neighbor) => !keys.has(neighbor)).length;
    }, 0);
  }

  private nextRoomMaterial(material: RoomMaterial): RoomMaterial | null {
    if (material === "wood") {
      return "clay";
    }
    if (material === "clay") {
      return "stone";
    }
    return null;
  }

  private uniquePositions(positions: CellPosition[]): CellPosition[] {
    const seen = new Set<string>();
    return positions.filter((position) => {
      const key = this.positionKey(position);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private positionKey(position: CellPosition): string {
    return `${position.row}:${position.col}`;
  }
}
