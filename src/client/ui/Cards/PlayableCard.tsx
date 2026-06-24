import { useState, type ReactNode } from "react";
import { minorImprovementArtById } from "../../assets/minorImprovementArt";
import { occupationArtById } from "../../assets/occupationArt";
import cardBackgroundUrl from "../../assets/major-facilities/card-background.png";
import occupationCardBackgroundUrl from "../../assets/occupations/card-background-grass-sky.png";
import victoryPointUrl from "../../assets/major-facilities/victory-point.png";
import { FamilyMemberIcon, RESOURCE_ICONS, type ResourceIconKey } from "../VisualSystem/ResourceIcons";
import type { AnimalKey, ResourceKey } from "../../../config/baseActions";
import { minorImprovements, type MinorImprovementDefinition } from "../../../config/minorImprovements";
import { occupations, type OccupationDefinition } from "../../../config/occupations";
import type { PlayerState } from "../../../state/PlayerState";

export type PlayableCardKind = "minor" | "occupation";
export type PlayableCardDefinition = MinorImprovementDefinition | OccupationDefinition;

export function PlayableCardFace({
  card,
  kind,
  footer,
}: {
  card: PlayableCardDefinition;
  kind: PlayableCardKind;
  footer?: ReactNode;
}) {
  const artUrl = kind === "minor" ? minorImprovementArtById[card.id] : occupationArtById[card.id];
  const artBackgroundUrl = kind === "occupation" ? occupationCardBackgroundUrl : cardBackgroundUrl;
  const artBackgroundClassName =
    kind === "occupation" ? "playable-card__art-bg playable-card__art-bg--scene" : "playable-card__art-bg";
  const minorCard = kind === "minor" ? (card as MinorImprovementDefinition) : null;
  const prerequisiteText = minorCard ? describePrerequisites(minorCard) : "";
  const titleMeta =
    kind === "minor" ? (
      <>
        <span className="playable-card__chip">
          <VictoryPointIcon size={16} />
          {(card as MinorImprovementDefinition).victoryPoints}
        </span>
        <span className="playable-card__chip">{(card as MinorImprovementDefinition).passesAfterPlay ? "传递" : "留场"}</span>
      </>
    ) : (
      <span className="playable-card__chip">{(card as OccupationDefinition).minPlayers}+ 人局</span>
    );

  return (
    <article className={`playable-card playable-card--${kind}`}>
      <header className="playable-card__head">
        <div className="playable-card__title-block">
          <h3>{card.name}</h3>
          <div className="playable-card__chip-row">{titleMeta}</div>
        </div>
      </header>
      <div className="playable-card__art" aria-hidden="true">
        <img alt="" className={artBackgroundClassName} src={artBackgroundUrl} />
        {artUrl ? (
          <img alt="" className="playable-card__art-image" src={artUrl} />
        ) : (
          <div className="playable-card__art-placeholder">
            <FamilyMemberIcon size={62} />
          </div>
        )}
      </div>
      <div className="playable-card__body">
        {kind === "minor" ? (
          <>
            <div className="playable-card__line">
              <span className="playable-card__line-label">成本</span>
              <CostIcons card={card as MinorImprovementDefinition} />
            </div>
            {prerequisiteText ? (
              <div className="playable-card__line">
                <span className="playable-card__line-label">前置</span>
                <span className="playable-card__line-content">{prerequisiteText}</span>
              </div>
            ) : null}
          </>
        ) : null}
        <p className="playable-card__effect">{card.effectText}</p>
      </div>
      <footer className="playable-card__footer">{footer}</footer>
    </article>
  );
}

export function PlayedCardShelf({ player }: { player: PlayerState | null }) {
  const [activeCard, setActiveCard] = useState<{ card: PlayableCardDefinition; kind: PlayableCardKind } | null>(null);

  if (!player) return null;
  const playedMinor = player.minorImprovements
    .map((id) => minorImprovements.find((card) => card.id === id))
    .filter((card): card is MinorImprovementDefinition => Boolean(card));
  const playedOccupations = player.occupations
    .map((id) => occupations.find((card) => card.id === id))
    .filter((card): card is OccupationDefinition => Boolean(card));

  return (
    <section className="played-card-shelf">
      <header className="played-card-shelf__header">
        <h3>已打出卡牌</h3>
        <p className="muted">其他玩家也能看到这里的公开卡牌。</p>
      </header>
      <div className="played-card-shelf__groups">
        <CardGroup
          title="小设施"
          cards={playedMinor}
          kind="minor"
          emptyText="还没有打出小设施。"
          onCardClick={(card, kind) => setActiveCard({ card, kind })}
        />
        <CardGroup
          title="职业"
          cards={playedOccupations}
          kind="occupation"
          emptyText="还没有打出职业。"
          onCardClick={(card, kind) => setActiveCard({ card, kind })}
        />
      </div>
      {activeCard ? <PlayedCardDetailOverlay activeCard={activeCard} onClose={() => setActiveCard(null)} /> : null}
    </section>
  );
}

function CardGroup({
  cards,
  emptyText,
  kind,
  onCardClick,
  title,
}: {
  cards: PlayableCardDefinition[];
  emptyText: string;
  kind: PlayableCardKind;
  onCardClick: (card: PlayableCardDefinition, kind: PlayableCardKind) => void;
  title: string;
}) {
  return (
    <section className="played-card-group">
      <h4>{title}</h4>
      <div className="played-card-grid">
        {cards.length === 0 ? <p className="muted">{emptyText}</p> : null}
        {cards.map((card) => (
          <PlayedCardChip
            key={card.id}
            card={card}
            kind={kind}
            onClick={() => onCardClick(card, kind)}
          />
        ))}
      </div>
    </section>
  );
}

function PlayedCardChip({
  card,
  kind,
  onClick,
}: {
  card: PlayableCardDefinition;
  kind: PlayableCardKind;
  onClick: () => void;
}) {
  const isMinor = kind === "minor";
  const minorCard = isMinor ? (card as MinorImprovementDefinition) : null;

  return (
    <button className={`played-card-chip played-card-chip--${kind}`} onClick={onClick} type="button">
      <span className="played-card-chip__icon" aria-hidden="true">
        {isMinor ? <RESOURCE_ICONS.wood size={20} /> : <FamilyMemberIcon size={20} />}
      </span>
      <span className="played-card-chip__body">
        <strong>{card.name}</strong>
        <span className="played-card-chip__meta">
          {minorCard ? (
            <>
              <span>
                <VictoryPointIcon size={14} />
                {minorCard.victoryPoints}
              </span>
              <span>{minorCard.passesAfterPlay ? "传递" : "留场"}</span>
            </>
          ) : (
            <span>职业</span>
          )}
        </span>
      </span>
      {minorCard ? (
        <span className="played-card-chip__cost">
          <CostIcons card={minorCard} />
        </span>
      ) : null}
    </button>
  );
}

function PlayedCardDetailOverlay({
  activeCard,
  onClose,
}: {
  activeCard: { card: PlayableCardDefinition; kind: PlayableCardKind };
  onClose: () => void;
}) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal played-card-detail-modal">
        <h2>{activeCard.card.name}</h2>
        <div className="played-card-detail-modal__body">
          <PlayableCardFace
            card={activeCard.card}
            kind={activeCard.kind}
            footer={<span className="playable-card__status">已打出</span>}
          />
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  );
}

const resourceCostOrder: ResourceKey[] = ["wood", "clay", "reed", "stone", "grain", "vegetable", "food"];
const animalCostOrder: AnimalKey[] = ["sheep", "boar", "cattle"];

function CostIcons({ card }: { card: MinorImprovementDefinition }) {
  const fixedEntries = [
    ...resourceCostOrder.map((key) => [key, card.cost[key] ?? 0] as const),
    ...animalCostOrder.map((key) => [key, card.animalCost[key] ?? 0] as const),
  ].filter((entry) => entry[1] > 0);
  const scalingEntries =
    card.scalingCost?.type === "perFamilyMember"
      ? resourceCostOrder.map((key) => [key, card.scalingCost?.cost[key] ?? 0] as const).filter((entry) => entry[1] > 0)
      : [];

  if (fixedEntries.length === 0 && scalingEntries.length === 0) {
    return <span className="playable-card__cost-icons">无</span>;
  }

  return (
    <span className="playable-card__cost-icons" title={card.costText}>
      {fixedEntries.map(([key, amount]) => (
        <CostIcon key={key} amount={amount} iconKey={key} />
      ))}
      {scalingEntries.length > 0 ? (
        <span className="playable-card__cost-scale">
          <span>每人</span>
          {scalingEntries.map(([key, amount]) => (
            <CostIcon key={key} amount={amount} iconKey={key} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

function CostIcon({ amount, iconKey }: { amount: number; iconKey: ResourceIconKey }) {
  const Icon = RESOURCE_ICONS[iconKey];
  return (
    <span className="playable-card__cost-icon">
      <Icon size={14} />
      <span>×{amount}</span>
    </span>
  );
}

function describePrerequisites(card: MinorImprovementDefinition) {
  if (card.requirements.length > 0) {
    return card.requirements.map((requirement) => requirement.text).join("；");
  }
  return card.prerequisiteText ?? "";
}

function VictoryPointIcon({ size = 16 }: { size?: number }) {
  return <img alt="" className="victory-point-icon" height={size} src={victoryPointUrl} width={size} />;
}
