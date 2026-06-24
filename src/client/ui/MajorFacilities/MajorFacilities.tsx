import { useState, type ReactNode } from "react";
import { majorImprovements, type MajorImprovementDefinition } from "../../../config/majorImprovements";
import { minorImprovements } from "../../../config/minorImprovements";
import { occupations } from "../../../config/occupations";
import { calculateMajorImprovementScoreDetail } from "../../../shared/majorImprovementScoring";
import type { AnimalCookInput, CookInput } from "../../../shared/types";
import type { GameState } from "../../../state/GameState";
import type { PlayerState } from "../../../state/PlayerState";
import basketmakerWorkshopArtUrl from "../../assets/major-facilities/basketmaker-workshop.png";
import cardBackgroundUrl from "../../assets/major-facilities/card-background.png";
import clayOvenArtUrl from "../../assets/major-facilities/clay-oven.png";
import cookingHearthArtUrl from "../../assets/major-facilities/cooking-hearth.png";
import fireplaceArtUrl from "../../assets/major-facilities/fireplace.png";
import joineryArtUrl from "../../assets/major-facilities/joinery.png";
import potteryArtUrl from "../../assets/major-facilities/pottery.png";
import stoneOvenArtUrl from "../../assets/major-facilities/stone-oven.png";
import victoryPointUrl from "../../assets/major-facilities/victory-point.png";
import wellArtUrl from "../../assets/major-facilities/well.png";
import { cookWithMajorImprovement } from "../../socket/clientSocket";
import { cookValue } from "../animalCooking";
import { PlayableCardFace } from "../Cards/PlayableCard";
import { RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";

type Animal = AnimalCookInput["animal"];
type MajorFacilitySlot = {
  card: MajorImprovementDefinition;
  purchasedBy: string | null;
};

const MAJOR_FACILITY_ART: Record<string, string> = {
  "fireplace-a": fireplaceArtUrl,
  "fireplace-b": fireplaceArtUrl,
  "cooking-hearth-a": cookingHearthArtUrl,
  "cooking-hearth-b": cookingHearthArtUrl,
  "clay-oven": clayOvenArtUrl,
  "stone-oven": stoneOvenArtUrl,
  joinery: joineryArtUrl,
  pottery: potteryArtUrl,
  "basketmaker-workshop": basketmakerWorkshopArtUrl,
  well: wellArtUrl,
};

interface MajorFacilitiesProps {
  game: GameState | null;
  isOwnPlayer: boolean;
  player: PlayerState | null;
  roomId: string | null;
}

export function MajorFacilities({ game, isOwnPlayer, player, roomId }: MajorFacilitiesProps) {
  const [marketOpen, setMarketOpen] = useState(false);
  const [handOpen, setHandOpen] = useState(false);
  const [activeFacilityId, setActiveFacilityId] = useState<string | null>(null);
  const ownedCards = player ? majorImprovements.filter((card) => player.majorImprovements.includes(card.id)) : [];
  const marketSlots = createMajorFacilitySlots(game?.majorImprovements ?? []);
  const activeFacility = ownedCards.find((card) => card.id === activeFacilityId) ?? null;

  return (
    <section className="major-facility-area">
      <button className="major-facility-button" disabled={!game || !player} onClick={() => setMarketOpen(true)}>
        <span className="major-facility-button__icon">
          <RESOURCE_ICONS.stone size={30} />
        </span>
        <span>
          大设施
          <small>{ownedCards.length > 0 ? `已拥有 ${ownedCards.length}` : "共享牌池"}</small>
        </span>
      </button>
      {ownedCards.length > 0 ? (
        <div className="owned-facility-list">
          {ownedCards.map((card) => (
            <button key={card.id} className="owned-facility-chip" onClick={() => setActiveFacilityId(card.id)}>
              {card.name}
              <small>
                <MajorFacilityScoreInline card={card} player={player} size={18} />
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">还没有大设施。</p>
      )}
      <button className="hand-entry-button" disabled={!player} onClick={() => setHandOpen(true)}>
        <RESOURCE_ICONS.wood size={26} />
        <span>
          手牌
          <small>{player ? (isOwnPlayer ? `小设施 ${player.minorImprovementHand.length} / 职业 ${player.occupationHand.length}` : "手牌已隐藏") : "等待玩家"}</small>
        </span>
      </button>
      {marketOpen ? <MajorFacilityMarket cardStates={game?.majorImprovements ?? []} mode="view" onClose={() => setMarketOpen(false)} player={player} slots={marketSlots} /> : null}
      {handOpen ? <PlayerHandOverlay isOwnPlayer={isOwnPlayer} onClose={() => setHandOpen(false)} player={player} /> : null}
      {activeFacility && player ? (
        <MajorFacilityUseOverlay
          card={activeFacility}
          isOwnPlayer={isOwnPlayer}
          onClose={() => setActiveFacilityId(null)}
          onCook={(cookedAnimals, cookedItems) => {
            if (!roomId || !player) return;
            cookWithMajorImprovement(roomId, player.id, activeFacility.id, cookedAnimals, cookedItems);
            setActiveFacilityId(null);
          }}
          player={player}
        />
      ) : null}
    </section>
  );
}

export function MajorFacilityMarket({
  cardStates,
  mode,
  onBuy,
  onClose,
  onOptionalAction,
  optionalActionLabel,
  player,
  slots: providedSlots,
}: {
  cardStates: GameState["majorImprovements"];
  mode: "view" | "buy";
  onBuy?: (cardId: string, upgradeFromId?: string) => void;
  onClose: () => void;
  onOptionalAction?: () => void;
  optionalActionLabel?: string;
  player: PlayerState | null;
  slots?: MajorFacilitySlot[];
}) {
  const slots = providedSlots ?? createMajorFacilitySlots(cardStates);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal major-facility-modal">
        <h2>{mode === "buy" ? "购买大设施" : "共享大设施"}</h2>
        <div className="major-facility-grid">
          {slots.length === 0 ? <p className="muted">共享牌池里还没有大设施。</p> : null}
          {slots.map(({ card, purchasedBy }) => (
            <MajorFacilityCard
              key={card.id}
              card={card}
              disabled={mode === "buy" && (Boolean(purchasedBy) || !canPayCard(player, card))}
              onBuy={mode === "buy" && !purchasedBy ? () => onBuy?.(card.id, upgradeFromId(player, card)) : undefined}
              player={player}
              purchasedBy={purchasedBy}
            />
          ))}
        </div>
        <footer className="game-modal__actions">
          {onOptionalAction && optionalActionLabel ? (
            <button className="secondary-button" onClick={onOptionalAction}>
              {optionalActionLabel}
            </button>
          ) : null}
          <button className="secondary-button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  );
}

function MajorFacilityCard({
  card,
  disabled,
  onBuy,
  player,
  purchasedBy,
}: {
  card: MajorImprovementDefinition;
  disabled?: boolean;
  onBuy?: () => void;
  player: PlayerState | null;
  purchasedBy?: string | null;
}) {
  const isOwned = player?.majorImprovements.includes(card.id) ?? false;
  const isPurchased = Boolean(purchasedBy);
  const artUrl = MAJOR_FACILITY_ART[card.id];

  return (
    <article className={`major-facility-card ${isPurchased ? "major-facility-card--purchased" : ""}`} aria-disabled={isPurchased || disabled}>
      <header className="major-facility-card__top">
        <h3>{card.name}</h3>
        <div className="major-facility-card__meta">
          <span className="major-facility-vp">
            <MajorFacilityScoreInline card={card} player={player} size={22} />
          </span>
          <CostList bundle={card.cost} />
        </div>
      </header>
      <div className="major-facility-art" aria-hidden="true">
        <img alt="" className="major-facility-art__background" src={cardBackgroundUrl} />
        {artUrl ? <img alt="" className="major-facility-art__item" src={artUrl} /> : null}
      </div>
      <EffectRows card={card} />
      {onBuy ? (
        <button className="major-facility-buy-button" disabled={disabled} onClick={onBuy}>
          {disabled ? "资源不足" : "购买"}
        </button>
      ) : isOwned ? (
        <span className="major-facility-owned">已拥有</span>
      ) : isPurchased ? (
        <span className="major-facility-owned major-facility-owned--purchased">已被购买</span>
      ) : null}
    </article>
  );
}

function MajorFacilityUseOverlay({
  card,
  isOwnPlayer,
  onClose,
  onCook,
  player,
}: {
  card: MajorImprovementDefinition;
  isOwnPlayer: boolean;
  onClose: () => void;
  onCook: (cookedAnimals: AnimalCookInput[], cookedItems: CookInput[]) => void;
  player: PlayerState;
}) {
  const [cookedAnimals, setCookedAnimals] = useState<AnimalCookInput[]>([]);
  const [cookedVegetable, setCookedVegetable] = useState(0);
  const cookEffects = card.effects.filter((effect) => effect.type === "cook");
  const cookedTotal = cookedAnimals.reduce((sum, item) => sum + item.count * cookValue(card, item.animal), 0) + cookedVegetable * cookVegetableValue(card);
  const canCook = isOwnPlayer && cookEffects.length > 0;

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal major-facility-use-modal">
        <span className="game-modal__eyebrow">大设施</span>
        <h2>{card.name}</h2>
        <EffectRows card={card} compact />
        {canCook ? (
          <div className="harvest-controls">
            {cookVegetableValue(card) > 0 ? (
              <label className="harvest-control harvest-control--with-icon">
                <RESOURCE_ICONS.vegetable size={24} />
                <span>
                  蔬菜烹饪
                  <small>每个 {cookVegetableValue(card)} 食物，最多 {player.resources.vegetable}</small>
                </span>
                <input
                  max={player.resources.vegetable}
                  min="0"
                  type="number"
                  value={cookedVegetable}
                  onChange={(event) => setCookedVegetable(clampNumber(Number(event.target.value), 0, player.resources.vegetable))}
                />
              </label>
            ) : null}
            {(["sheep", "boar", "cattle"] as const).map((animal) => {
              const value = cookedAnimals.find((item) => item.animal === animal)?.count ?? 0;
              const max = player.animals[animal];
              return (
                <label key={animal} className="harvest-control harvest-control--with-icon">
                  <AnimalIcon animal={animal} />
                  <span>
                    {animalLabel(animal)} 烹饪
                    <small>每只 {cookValue(card, animal)} 食物，最多 {max}</small>
                  </span>
                  <input
                    max={max}
                    min="0"
                    type="number"
                    value={value}
                    onChange={(event) => setCookedAnimals(setCookedAnimalCount(cookedAnimals, animal, clampNumber(Number(event.target.value), 0, max)))}
                  />
                </label>
              );
            })}
            <div className="harvest-summary">
              <ResourceBadge type="food" label="将获得" count={cookedTotal} />
            </div>
          </div>
        ) : (
          <p className="muted">{isOwnPlayer ? "这个大设施当前没有可主动使用的动物烹饪效果。" : "只能在自己的农场使用大设施。"}</p>
        )}
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onClose}>
            关闭
          </button>
          {canCook ? (
            <button disabled={cookedAnimals.length === 0 && cookedVegetable === 0} onClick={() => onCook(cookedAnimals, cookedVegetable > 0 ? [{ from: "vegetable", count: cookedVegetable }] : [])}>
              确认烹饪
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}

function CostList({ bundle }: { bundle: Record<string, number> }) {
  const entries = Object.entries(bundle).filter((entry): entry is [ResourceIconKey, number] => isResourceIconKey(entry[0]) && entry[1] > 0);
  if (entries.length === 0) return <span className="major-facility-cost-list">无消耗</span>;
  return (
    <span className="major-facility-cost-list">
      {entries.map(([resource, amount]) => {
        const Icon = RESOURCE_ICONS[resource];
        return (
          <span key={resource}>
            <Icon size={20} /> × {amount}
          </span>
        );
      })}
    </span>
  );
}

function EffectRows({ card, compact = false }: { card: MajorImprovementDefinition; compact?: boolean }) {
  const cookEffects = card.effects.filter((effect) => effect.type === "cook");
  const otherEffects = card.effects.filter((effect) => effect.type !== "cook");

  return (
    <div className={`major-facility-effects ${compact ? "major-facility-effects--compact" : ""}`}>
      {cookEffects.length > 0 ? (
        <EffectSection label="任意时候">
          {cookEffects.map((effect, index) => (
            <IconRule
              key={`cook-${effect.from}-${index}`}
              from={[{ type: effect.from, count: 1 }]}
              to={[{ type: "food", count: effect.toFood }]}
            />
          ))}
        </EffectSection>
      ) : null}
      {otherEffects.map((effect, index) => {
        if (effect.type === "bakeBread") {
          const grainLimit = effect.grainLimit ?? 1;
          return (
            <EffectSection key={`${effect.type}-${index}`} label="烤面包">
              {Array.from({ length: grainLimit }, (_, itemIndex) => itemIndex + 1).map((grainCount) => (
                <IconRule
                  key={`${effect.type}-${grainCount}`}
                  from={[{ type: "grain", count: grainCount }]}
                  to={[{ type: "food", count: grainCount * effect.foodPerGrain }]}
                />
              ))}
            </EffectSection>
          );
        }
        if (effect.type === "harvestConvert") {
          return (
            <EffectSection key={`${effect.type}-${effect.resource}-${index}`} label="收获">
              <IconRule from={[{ type: effect.resource, count: effect.amount }]} to={[{ type: "food", count: effect.food }]} />
            </EffectSection>
          );
        }
        if (effect.type === "gameEndResourceBonus") {
          return (
            <EffectSection key={`${effect.type}-${effect.resource}-${index}`} label="终局">
              <BonusRule resource={effect.resource} ranges={effect.ranges} />
            </EffectSection>
          );
        }
        if (effect.type === "wellFood") {
          return (
            <EffectSection key={`${effect.type}-${index}`} label={`未来${effect.rounds}轮`}>
              <IconRule from={[]} to={[{ type: "food", count: effect.foodPerRound }]} />
            </EffectSection>
          );
        }
        return null;
      })}
    </div>
  );
}

function EffectSection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="major-facility-effect-section">
      <span className="major-facility-effect-section__label">{label}</span>
      <div className="major-facility-effect-section__rows">{children}</div>
    </section>
  );
}

function IconRule({
  from,
  to,
}: {
  from: Array<{ type: string; count: number }>;
  to: Array<{ type: string; count: number }>;
}) {
  return (
    <div className="major-facility-rule">
      <IconGroup items={from} />
      <span className="major-facility-arrow">→</span>
      <IconGroup items={to} />
    </div>
  );
}

function BonusRule({
  ranges,
  resource,
}: {
  ranges: Array<{ min: number; max: number | null; points: number }>;
  resource: string;
}) {
  const visibleRanges = ranges.filter((range) => range.points > 0);
  return (
    <div className="major-facility-rule major-facility-rule--bonus">
      <IconOnly type={resource} />
      <span className="major-facility-arrow">→</span>
      <span className="major-facility-bonus-ranges">
        {visibleRanges.map((range) => (
          <span key={`${range.min}-${range.max ?? "more"}`}>
            {range.min}
            {range.max ? `-${range.max}` : "+"}
            <VictoryPointIcon size={17} /> × {range.points}
          </span>
        ))}
      </span>
    </div>
  );
}

function IconGroup({ items }: { items: Array<{ type: string; count: number }> }) {
  if (items.length === 0) {
    return <span className="major-facility-icon-group major-facility-icon-group--empty">回合开始</span>;
  }
  return (
    <span className="major-facility-icon-group">
      {items.map((item) => {
        if (!isResourceIconKey(item.type)) return null;
        const Icon = RESOURCE_ICONS[item.type];
        return (
          <span key={item.type} className="major-facility-icon-count">
            <Icon size={22} /> × {item.count}
          </span>
        );
      })}
    </span>
  );
}

function PlayerHandOverlay({ isOwnPlayer, onClose, player }: { isOwnPlayer: boolean; onClose: () => void; player: PlayerState | null }) {
  const minorHand = player ? player.minorImprovementHand.map((id) => minorImprovements.find((card) => card.id === id)).filter((card): card is (typeof minorImprovements)[number] => Boolean(card)) : [];
  const occupationHand = player ? player.occupationHand.map((id) => occupations.find((card) => card.id === id)).filter((card): card is (typeof occupations)[number] => Boolean(card)) : [];

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal player-hand-modal">
        <span className="game-modal__eyebrow">手牌</span>
        <h2>{player?.name ?? "玩家"} 的卡牌</h2>
        {!player ? <p className="muted">暂无玩家。</p> : null}
        {player && !isOwnPlayer ? <p className="muted">其他玩家的手牌已隐藏；已打出的卡会显示在农场资源区下方。</p> : null}
        {player && isOwnPlayer ? (
          <div className="player-hand-sections">
            <HandSection title="小设施手牌" emptyText="没有小设施手牌。">
              {minorHand.map((card) => (
                <PlayableCardFace key={card.id} card={card} kind="minor" footer={<span className="playable-card__status">手牌</span>} />
              ))}
            </HandSection>
            <HandSection title="职业手牌" emptyText="没有职业手牌。">
              {occupationHand.map((card) => (
                <PlayableCardFace key={card.id} card={card} kind="occupation" footer={<span className="playable-card__status">手牌</span>} />
              ))}
            </HandSection>
          </div>
        ) : null}
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  );
}

function HandSection({ children, emptyText, title }: { children: ReactNode; emptyText: string; title: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="hand-section">
      <h3>{title}</h3>
      <div className="hand-card-grid">{items.length > 0 ? items : <p className="muted">{emptyText}</p>}</div>
    </section>
  );
}

function IconOnly({ type }: { type: string }) {
  if (!isResourceIconKey(type)) return null;
  const Icon = RESOURCE_ICONS[type];
  return (
    <span className="major-facility-icon-group">
      <span className="major-facility-icon-count">
        <Icon size={22} />
      </span>
    </span>
  );
}

function MajorFacilityScoreInline({ card, player, size }: { card: MajorImprovementDefinition; player: PlayerState | null; size: number }) {
  const detail = player?.majorImprovements.includes(card.id) ? calculateMajorImprovementScoreDetail(player, card.id) : null;
  const total = detail?.totalPoints ?? card.victoryPoints;
  const bonus = detail?.bonusPoints ?? 0;
  const ResourceIcon = detail?.bonusResource ? RESOURCE_ICONS[detail.bonusResource] : null;
  return (
    <span className={`major-facility-score-inline ${bonus > 0 ? "major-facility-score-inline--bonus" : ""}`}>
      <VictoryPointIcon size={size} /> × {total}
      {bonus > 0 && ResourceIcon ? (
        <small>
          {detail?.basePoints}+{bonus}
          <ResourceIcon size={14} />×{detail?.bonusResourceCount ?? 0}
        </small>
      ) : null}
    </span>
  );
}

function VictoryPointIcon({ size = 22 }: { size?: number }) {
  return <img alt="" className="victory-point-icon" height={size} src={victoryPointUrl} width={size} />;
}

function ResourceBadge({ count, label, type }: { count: number; label: string; type: ResourceIconKey }) {
  const Icon = RESOURCE_ICONS[type];
  return (
    <span className="harvest-resource-badge">
      <Icon size={22} />
      <span>{label}</span>
      <b>{count}</b>
    </span>
  );
}

function AnimalIcon({ animal }: { animal: Animal }) {
  const Icon = RESOURCE_ICONS[animal];
  return <Icon size={24} />;
}

function canPayCard(player: PlayerState | null, card: MajorImprovementDefinition): boolean {
  if (canPayCost(player, card)) return true;
  const upgradeId = upgradeFromId(player, card);
  return Boolean(upgradeId && canPayCost(player, card, upgradeId));
}

function canPayCost(player: PlayerState | null, card: MajorImprovementDefinition, upgradeId?: string): boolean {
  if (!player) return false;
  const upgradeCost = upgradeId ? majorImprovements.find((candidate) => candidate.id === upgradeId)?.cost ?? {} : {};
  return Object.entries(card.cost).every(([resource, amount]) => {
    if (!isPlayerResource(resource)) return true;
    return player.resources[resource] >= Math.max(0, amount - (upgradeCost[resource] ?? 0));
  });
}

function upgradeFromId(player: PlayerState | null, card: MajorImprovementDefinition): string | undefined {
  return card.upgradeFrom?.find((id) => player?.majorImprovements.includes(id));
}

function setCookedAnimalCount(cookedAnimals: AnimalCookInput[], animal: Animal, count: number): AnimalCookInput[] {
  const next = cookedAnimals.filter((item) => item.animal !== animal);
  if (count > 0) next.push({ animal, count });
  return next;
}

function cookVegetableValue(card: MajorImprovementDefinition): number {
  const effect = card.effects.find((candidate) => candidate.type === "cook" && candidate.from === "vegetable");
  return effect?.type === "cook" ? effect.toFood : 0;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function animalLabel(animal: Animal): string {
  const labels: Record<Animal, string> = {
    sheep: "羊",
    boar: "野猪",
    cattle: "牛",
  };
  return labels[animal];
}

function isResourceIconKey(value: string): value is ResourceIconKey {
  return value in RESOURCE_ICONS;
}

function isPlayerResource(value: string): value is keyof PlayerState["resources"] {
  return ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"].includes(value);
}

function createMajorFacilitySlots(cardStates: GameState["majorImprovements"]): MajorFacilitySlot[] {
  const purchasedById = new Map(cardStates.map((cardState) => [cardState.id, cardState.purchasedBy ?? null]));
  return majorImprovements.map((card) => ({
    card,
    purchasedBy: purchasedById.get(card.id) ?? null,
  }));
}
