import type { ResourceKey } from "../config/baseActions";
import type { CellPosition } from "../shared/types";
import type { AnimalGroup, FarmAnimalType, FarmCell, FarmState, FenceEdge, FenceEdgeSide, FenceSegment, RoomMaterial } from "../state/FarmState";
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
      fences: [],
      fenceSegments: [],
      pastures: [],
      animalHousing: {
        house: { animal: null, count: 0 },
        stables: [],
        cells: [],
      },
    };
  }

  migrateFarm(farm: FarmState): FarmState {
    const fenceSegments = farm.fenceSegments?.length > 0 ? this.uniqueSegments(farm.fenceSegments) : this.uniqueSegments((farm.fences ?? []).map((edge) => this.edgeToSegment(edge)));
    const withDefaults: FarmState = {
      ...farm,
      fences: farm.fences ?? fenceSegments.map((segment) => this.segmentToEdge(segment)),
      fenceSegments,
      pastures: (farm.pastures ?? []).map((pasture) => ({
        ...pasture,
        fenceEdges: pasture.fenceEdges ?? this.createBoundaryEdges(pasture.cells),
        animalType: pasture.animalType ?? null,
        animalCount: pasture.animalCount ?? 0,
        capacity: pasture.capacity ?? this.calculatePastureCapacity(farm, pasture.cells),
      })),
      animalHousing: farm.animalHousing ?? {
        house: { animal: null, count: 0 },
        stables: farm.cells
          .filter((cell) => cell.stable && !cell.pastureId)
          .map((cell) => ({ row: cell.row, col: cell.col, animal: null, count: 0 })),
        cells: [],
      },
    };
    withDefaults.animalHousing = {
      ...withDefaults.animalHousing,
      cells: withDefaults.animalHousing.cells ?? this.createAnimalCellsFromPastures(withDefaults),
    };

    if (withDefaults.fenceSegments.length > 0) {
      return this.recalculatePastures({ ...withDefaults, fencesUsed: withDefaults.fenceSegments.length });
    }

    const legacyFences = withDefaults.pastures.flatMap((pasture) => pasture.fenceEdges);
    return this.recalculatePastures({
      ...withDefaults,
      fences: this.uniqueEdges(legacyFences),
      fenceSegments: this.uniqueSegments(legacyFences.map((edge) => this.edgeToSegment(edge))),
      fencesUsed: legacyFences.length > 0 ? this.uniqueEdges(legacyFences).length : withDefaults.fencesUsed,
    });
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

    return {
      ...nextPlayer,
      farm: this.recalculatePastures({
        ...nextPlayer.farm,
        animalHousing: {
          ...nextPlayer.farm.animalHousing,
          stables: [
            ...nextPlayer.farm.animalHousing.stables,
            ...uniquePositions.map((position) => ({ row: position.row, col: position.col, animal: null, count: 0 as number })),
          ],
          cells: nextPlayer.farm.animalHousing.cells,
        },
      }),
    };
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
      farm: this.migrateFarm({
        ...nextPlayer.farm,
        fencesUsed: nextPlayer.farm.fencesUsed + fenceCost,
        fences: this.uniqueEdges([...nextPlayer.farm.fences, ...this.createBoundaryEdges(uniquePositions)]),
        fenceSegments: this.uniqueSegments([...nextPlayer.farm.fenceSegments, ...this.createBoundaryEdges(uniquePositions).map((edge) => this.edgeToSegment(edge))]),
        pastures: [...nextPlayer.farm.pastures, { id: pastureId, cells: uniquePositions, fenceEdges: this.createBoundaryEdges(uniquePositions), animalType: null, animalCount: 0, capacity: this.calculatePastureCapacity(nextPlayer.farm, uniquePositions) }],
      }),
    };
  }

  buildFencesByEdges(player: PlayerState, edges: FenceEdge[]): PlayerState {
    return this.buildFencesBySegments(player, edges.map((edge) => this.edgeToSegment(edge)));
  }

  buildFencesBySegments(player: PlayerState, segments: FenceSegment[]): PlayerState {
    const farm = this.migrateFarm(player.farm);
    const newSegments = this.uniqueSegments(segments).filter((segment) => !this.hasFenceSegment(farm, segment));
    if (newSegments.length === 0) {
      return player;
    }
    newSegments.forEach((segment) => this.assertFenceSegmentBuildable(farm, segment));
    if (farm.fencesUsed + newSegments.length > 15) {
      throw new Error("每个玩家最多15个栅栏。");
    }

    const paid = this.pay({ ...player, farm }, { wood: newSegments.length });
    const nextFarm = this.recalculatePastures({
      ...paid.farm,
      fenceSegments: this.uniqueSegments([...paid.farm.fenceSegments, ...newSegments]),
      fences: this.uniqueEdges([...paid.farm.fences, ...newSegments.map((segment) => this.segmentToEdge(segment))]),
      fencesUsed: paid.farm.fencesUsed + newSegments.length,
    });

    if (nextFarm.pastures.length === paid.farm.pastures.length) {
      throw new Error("围栏必须形成至少一个封闭牧场。");
    }

    return { ...paid, farm: nextFarm };
  }

  recalculatePastures(farm: FarmState): FarmState {
    farm = {
      ...farm,
      fenceSegments: this.uniqueSegments(farm.fenceSegments ?? (farm.fences ?? []).map((edge) => this.edgeToSegment(edge))),
    };
    const passableCells = farm.cells.filter((cell) => !cell.room && !cell.field);
    const passableKeys = new Set(passableCells.map((cell) => this.positionKey(cell)));
    const seen = new Set<string>();
    const pastures: FarmState["pastures"] = [];

    passableCells.forEach((cell) => {
      const key = this.positionKey(cell);
      if (seen.has(key)) return;

      const group: CellPosition[] = [];
      const queue: CellPosition[] = [cell];
      seen.add(key);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;
        group.push({ row: current.row, col: current.col });

        (["top", "right", "bottom", "left"] as FenceEdgeSide[]).forEach((edge) => {
          if (this.hasFence(farm, { row: current.row, col: current.col, edge })) return;
          const neighbor = this.neighbor(current, edge);
          if (!neighbor || !passableKeys.has(this.positionKey(neighbor))) return;
          const neighborKey = this.positionKey(neighbor);
          if (seen.has(neighborKey)) return;
          seen.add(neighborKey);
          queue.push(neighbor);
        });
      }

      if (!this.isClosedGroup(farm, group)) return;

      const pastureId = `pasture-${pastures.length + 1}`;
      const previous = this.findMatchingPasture(farm.pastures, group);
      const animalCells = farm.animalHousing.cells.filter((item) => group.some((cell) => cell.row === item.row && cell.col === item.col));
      const animalType = animalCells.find((item) => item.animal)?.animal ?? previous?.animalType ?? null;
      const animalCount = animalCells.reduce((sum, item) => sum + item.count, 0);
      pastures.push({
        id: previous?.id ?? pastureId,
        cells: group,
        fenceEdges: this.createBoundaryEdges(group),
        animalType,
        animalCount,
        capacity: this.calculatePastureCapacity(farm, group),
      });
    });

    const pastureByCell = new Map<string, string>();
    pastures.forEach((pasture) => pasture.cells.forEach((cell) => pastureByCell.set(this.positionKey(cell), pasture.id)));

    return {
      ...farm,
      fenceSegments: this.uniqueSegments(farm.fenceSegments),
      fences: this.uniqueEdges(farm.fenceSegments.map((segment) => this.segmentToEdge(segment))),
      fencesUsed: this.uniqueSegments(farm.fenceSegments).length,
      pastures,
      cells: farm.cells.map((cell) => ({
        ...cell,
        pastureId: pastureByCell.get(this.positionKey(cell)) ?? null,
      })),
      animalHousing: {
        ...farm.animalHousing,
        cells: farm.animalHousing.cells.filter((item) => item.count > 0),
      },
    };
  }

  placeAnimals(player: PlayerState, animal: FarmAnimalType, amount: number, placements: NonNullable<import("../shared/types").AnimalPlacementInput["placements"]>): PlayerState {
    const totalPlaced = placements.reduce((sum, placement) => sum + placement.count, 0);
    if (totalPlaced > amount) {
      throw new Error("安置动物数量超过获得数量。");
    }

    let farm = this.migrateFarm(player.farm);
    placements.forEach((placement) => {
      if (placement.count <= 0) return;
      if (placement.type === "house") {
        farm = { ...farm, animalHousing: { ...farm.animalHousing, house: this.addToGroup(farm.animalHousing.house, animal, placement.count, 1) } };
      }
      if (placement.type === "stable") {
        const stable = farm.animalHousing.stables.find((candidate) => candidate.row === placement.row && candidate.col === placement.col);
        if (!stable) throw new Error("该马厩不能安置动物。");
        const updatedStable = this.addToGroup(stable, animal, placement.count, 1);
        farm = {
          ...farm,
          animalHousing: {
            ...farm.animalHousing,
            stables: farm.animalHousing.stables.map((candidate) => (candidate.row === placement.row && candidate.col === placement.col ? updatedStable : candidate)),
          },
        };
      }
      if (placement.type === "pasture") {
        const pasture = farm.pastures.find((candidate) => candidate.id === placement.pastureId);
        if (!pasture) throw new Error("牧场不存在。");
        if (!pasture.cells.some((cell) => cell.row === placement.row && cell.col === placement.col)) {
          throw new Error("该牧场格不能安置动物。");
        }
        const updated = this.addToGroup({ animal: pasture.animalType, count: pasture.animalCount }, animal, placement.count, pasture.capacity);
        const existingCell = farm.animalHousing.cells.find((candidate) => candidate.row === placement.row && candidate.col === placement.col);
        const updatedCell = this.addToGroup(existingCell ?? { row: placement.row, col: placement.col, animal: null, count: 0 }, animal, placement.count, pasture.capacity);
        farm = {
          ...farm,
          animalHousing: {
            ...farm.animalHousing,
            cells: existingCell
              ? farm.animalHousing.cells.map((candidate) => (candidate.row === placement.row && candidate.col === placement.col ? updatedCell : candidate))
              : [...farm.animalHousing.cells, updatedCell],
          },
          pastures: farm.pastures.map((candidate) =>
            candidate.id === placement.pastureId ? { ...candidate, animalType: updated.animal, animalCount: updated.count } : candidate,
          ),
        };
      }
    });

    return {
      ...player,
      farm,
      animals: {
        ...player.animals,
        [animal]: player.animals[animal] + totalPlaced,
      },
    };
  }

  removeAnimals(player: PlayerState, animal: FarmAnimalType, amount: number): PlayerState {
    if (amount <= 0) return player;
    if (player.animals[animal] < amount) {
      throw new Error("动物不足，不能移除。");
    }

    let remaining = amount;
    let farm = this.migrateFarm(player.farm);

    const house = farm.animalHousing.house;
    if (remaining > 0 && house.animal === animal && house.count > 0) {
      const removed = Math.min(remaining, house.count);
      remaining -= removed;
      farm = {
        ...farm,
        animalHousing: {
          ...farm.animalHousing,
          house: { animal: house.count - removed > 0 ? animal : null, count: house.count - removed },
        },
      };
    }

    farm = {
      ...farm,
      animalHousing: {
        ...farm.animalHousing,
        stables: farm.animalHousing.stables.map((stable) => {
          if (remaining <= 0 || stable.animal !== animal || stable.count <= 0) return stable;
          const removed = Math.min(remaining, stable.count);
          remaining -= removed;
          return { ...stable, animal: stable.count - removed > 0 ? animal : null, count: stable.count - removed };
        }),
      },
    };

    farm = {
      ...farm,
      animalHousing: {
        ...farm.animalHousing,
        cells: farm.animalHousing.cells
          .map((cell) => {
            if (remaining <= 0 || cell.animal !== animal || cell.count <= 0) return cell;
            const removed = Math.min(remaining, cell.count);
            remaining -= removed;
            return { ...cell, animal: cell.count - removed > 0 ? animal : null, count: cell.count - removed };
          })
          .filter((cell) => cell.count > 0),
      },
    };

    if (remaining > 0) {
      throw new Error("动物位置不足，不能移除。");
    }

    return {
      ...player,
      farm: this.recalculatePastures(farm),
      animals: {
        ...player.animals,
        [animal]: player.animals[animal] - amount,
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

  private createBoundaryEdges(positions: CellPosition[]): FenceEdge[] {
    const keys = new Set(positions.map((position) => this.positionKey(position)));
    return positions.flatMap((position) =>
      ([
        { edge: "top" as const, neighbor: { row: position.row - 1, col: position.col } },
        { edge: "right" as const, neighbor: { row: position.row, col: position.col + 1 } },
        { edge: "bottom" as const, neighbor: { row: position.row + 1, col: position.col } },
        { edge: "left" as const, neighbor: { row: position.row, col: position.col - 1 } },
      ]).flatMap((item) => (keys.has(this.positionKey(item.neighbor)) ? [] : [{ row: position.row, col: position.col, edge: item.edge }])),
    );
  }

  private createAnimalCellsFromPastures(farm: FarmState) {
    return (farm.pastures ?? []).flatMap((pasture) => {
      if (!pasture.animalType || pasture.animalCount <= 0) return [];
      const firstCell = pasture.cells[0];
      if (!firstCell) return [];
      return [{ row: firstCell.row, col: firstCell.col, animal: pasture.animalType, count: pasture.animalCount }];
    });
  }

  private edgeToSegment(edge: FenceEdge): FenceSegment {
    const normalized = this.normalizeEdge(edge);
    if (normalized.edge === "right") return { orientation: "vertical", row: normalized.row, col: normalized.col + 1 };
    if (normalized.edge === "left") return { orientation: "vertical", row: normalized.row, col: normalized.col };
    if (normalized.edge === "top") return { orientation: "horizontal", row: normalized.row, col: normalized.col };
    return { orientation: "horizontal", row: normalized.row + 1, col: normalized.col };
  }

  private segmentToEdge(segment: FenceSegment): FenceEdge {
    const normalized = this.normalizeSegment(segment);
    if (normalized.orientation === "vertical") {
      if (normalized.col === 0) return { row: normalized.row, col: 0, edge: "left" };
      return { row: normalized.row, col: normalized.col - 1, edge: "right" };
    }
    if (normalized.row === 0) return { row: 0, col: normalized.col, edge: "top" };
    return { row: normalized.row - 1, col: normalized.col, edge: "bottom" };
  }

  private uniqueSegments(segments: FenceSegment[]): FenceSegment[] {
    const seen = new Set<string>();
    return segments
      .map((segment) => this.normalizeSegment(segment))
      .filter((segment) => {
        const key = this.segmentKey(segment);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private normalizeSegment(segment: FenceSegment): FenceSegment {
    return {
      orientation: segment.orientation,
      row: segment.row,
      col: segment.col,
    };
  }

  private segmentKey(segment: FenceSegment): string {
    const normalized = this.normalizeSegment(segment);
    return `${normalized.orientation}:${normalized.row}:${normalized.col}`;
  }

  private hasFenceSegment(farm: FarmState, segment: FenceSegment): boolean {
    const key = this.segmentKey(segment);
    return this.uniqueSegments(farm.fenceSegments ?? []).some((candidate) => this.segmentKey(candidate) === key);
  }

  private assertFenceSegmentBuildable(farm: FarmState, segment: FenceSegment): void {
    const adjacentCells = this.segmentAdjacentCells(farm, segment);
    if (adjacentCells.length === 0) {
      throw new Error("围栏位置不存在。");
    }
    if (adjacentCells.every((cell) => cell.room || cell.field)) {
      throw new Error("围栏不能建在房屋或田地的内部边界上。");
    }
  }

  private segmentAdjacentCells(farm: FarmState, segment: FenceSegment): FarmCell[] {
    const normalized = this.normalizeSegment(segment);
    const positions =
      normalized.orientation === "vertical"
        ? [
            { row: normalized.row, col: normalized.col - 1 },
            { row: normalized.row, col: normalized.col },
          ]
        : [
            { row: normalized.row - 1, col: normalized.col },
            { row: normalized.row, col: normalized.col },
          ];
    return positions
      .filter((position) => position.row >= 0 && position.col >= 0 && position.row < farm.rows && position.col < farm.cols)
      .map((position) => farm.cells.find((cell) => cell.row === position.row && cell.col === position.col))
      .filter((cell): cell is FarmCell => Boolean(cell));
  }

  private uniqueEdges(edges: FenceEdge[]): FenceEdge[] {
    const seen = new Set<string>();
    return edges
      .map((edge) => this.normalizeEdge(edge))
      .filter((edge) => {
        const key = this.edgeKey(edge);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  private normalizeEdge(edge: FenceEdge): FenceEdge {
    if (edge.edge === "left" && edge.col > 0) return { row: edge.row, col: edge.col - 1, edge: "right" };
    if (edge.edge === "top" && edge.row > 0) return { row: edge.row - 1, col: edge.col, edge: "bottom" };
    return edge;
  }

  private hasFence(farm: FarmState, edge: FenceEdge): boolean {
    return this.hasFenceSegment(farm, this.edgeToSegment(edge));
  }

  private edgeKey(edge: FenceEdge): string {
    const normalized = this.normalizeEdge(edge);
    return `${normalized.row}:${normalized.col}:${normalized.edge}`;
  }

  private neighbor(position: CellPosition, edge: FenceEdgeSide): CellPosition | null {
    const next =
      edge === "top"
        ? { row: position.row - 1, col: position.col }
        : edge === "right"
          ? { row: position.row, col: position.col + 1 }
          : edge === "bottom"
            ? { row: position.row + 1, col: position.col }
            : { row: position.row, col: position.col - 1 };
    if (next.row < 0 || next.col < 0 || next.row >= 3 || next.col >= 5) return null;
    return next;
  }

  private isClosedGroup(farm: FarmState, group: CellPosition[]): boolean {
    const keys = new Set(group.map((position) => this.positionKey(position)));
    return group.every((position) =>
      (["top", "right", "bottom", "left"] as FenceEdgeSide[]).every((edge) => {
        const neighbor = this.neighbor(position, edge);
        if (neighbor && keys.has(this.positionKey(neighbor))) return true;
        return this.hasFence(farm, { row: position.row, col: position.col, edge });
      }),
    );
  }

  private calculatePastureCapacity(farm: FarmState, cells: CellPosition[]): number {
    const stableCount = cells.filter((position) => farm.cells.some((cell) => cell.row === position.row && cell.col === position.col && cell.stable)).length;
    return cells.length * 2 * (stableCount > 0 ? 2 : 1);
  }

  private findMatchingPasture(pastures: FarmState["pastures"], cells: CellPosition[]) {
    const key = cells.map((cell) => this.positionKey(cell)).sort().join("|");
    return pastures.find((pasture) => pasture.cells.map((cell) => this.positionKey(cell)).sort().join("|") === key);
  }

  private addToGroup<T extends AnimalGroup>(group: T, animal: FarmAnimalType, amount: number, capacity: number): T {
    if (group.animal && group.animal !== animal) throw new Error("同一空间不能混养动物。");
    if (group.count + amount > capacity) throw new Error("动物容量不足。");
    return { ...group, animal, count: group.count + amount };
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
