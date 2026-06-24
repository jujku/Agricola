import { useEffect, useRef, useState, type ReactNode } from "react";
import { majorImprovements } from "../config/majorImprovements";
import { getMinorImprovement, minorImprovements } from "../config/minorImprovements";
import { getOccupation, occupations } from "../config/occupations";
import type { AnimalCookInput, AnimalOverflowResolution, RoomListItem } from "../shared/types";
import {
  adjustAdminResource,
  advanceAdminRound,
  addAdminCardToHand,
  addComputerPlayer,
  createRoom,
  confirmGameEnd,
  joinRoom,
  leaveRoom,
  login,
  logout,
  register,
  restartAdminTestRoom,
  setPlayerReady,
  startAdminHarvest,
  startGame,
  submitCardDraftPick,
  submitHarvestBreeding,
  submitHarvestFeeding,
  submitHarvestField,
  wireSocketToStore,
} from "./socket/clientSocket";
import { useGameStore } from "./store/gameStore";
import { Board } from "./ui/Board/Board";
import { PlayableCardFace, type PlayableCardDefinition, type PlayableCardKind } from "./ui/Cards/PlayableCard";
import { Farm } from "./ui/Farm/Farm";
import { OperationLog } from "./ui/OperationLog/OperationLog";
import { Resources } from "./ui/Resources/Resources";
import { FinalScoreReveal } from "./ui/Scoring/FinalScoreReveal";
import { ScoringGuide } from "./ui/Scoring/ScoringGuide";
import { calculateLiveScore } from "./ui/Scoring/scoringView";
import { RESOURCE_ICONS } from "./ui/VisualSystem/ResourceIcons";
import { getPlayerColor, getPlayerColorById } from "./ui/VisualSystem/playerColors";

const emptyPlayers: NonNullable<ReturnType<typeof useGameStore.getState>["game"]>["players"] = [];
type Player = (typeof emptyPlayers)[number];
type Animal = AnimalCookInput["animal"];
type BadgeType = "wood" | "clay" | "reed" | "stone" | "grain" | "vegetable" | "food" | "begging" | Animal;
type HarvestConversionOption = {
  cardId: string;
  conversionId?: string;
  optionKey: string;
  cardName: string;
  resource: BadgeType;
  amount: number;
  food: number;
  max: number;
  outputResource?: BadgeType;
  outputAmount?: number;
};
type AdminAdjustKey = Parameters<typeof adjustAdminResource>[2];

export function App() {
  const { connected, game, notice, roomId, rooms, setNotice, username } = useGameStore();
  const [screen, setScreen] = useState<"main" | "lobby">("main");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [manualRoomId, setManualRoomId] = useState("");
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [grainToFood, setGrainToFood] = useState(0);
  const [vegetableToFood, setVegetableToFood] = useState(0);
  const [feedingCookedAnimals, setFeedingCookedAnimals] = useState<AnimalCookInput[]>([]);
  const [harvestConversions, setHarvestConversions] = useState<Record<string, number>>({});
  const [breedingCookedAnimals, setBreedingCookedAnimals] = useState<AnimalCookInput[]>([]);
  const [breedingPlacements, setBreedingPlacements] = useState<AnimalOverflowResolution["placements"]>([]);

  useEffect(() => wireSocketToStore(), []);
  useEffect(() => {
    if (!game) return;
    if (!viewingPlayerId || !game.players.some((player) => player.id === viewingPlayerId)) {
      setViewingPlayerId(username ?? game.players[0]?.id ?? null);
    }
  }, [game, username, viewingPlayerId]);
  useEffect(() => {
    if (game?.phase !== "HARVEST" || game.stage !== "HARVEST_FEEDING" || !game.harvestFeeding) return;
    setGrainToFood(0);
    setVegetableToFood(0);
    setFeedingCookedAnimals([]);
    setHarvestConversions({});
  }, [game?.harvestFeeding?.round]);
  useEffect(() => {
    if (game?.phase !== "HARVEST" || game.stage !== "HARVEST_BREEDING" || !game.harvestBreeding) return;
    setBreedingCookedAnimals([]);
    setBreedingPlacements([]);
  }, [game?.harvestBreeding?.round]);

  if (!username) {
    return (
      <>
        <AuthPage
          authMode={authMode}
          connected={connected}
          password={authPassword}
          username={authUsername}
          onModeChange={setAuthMode}
          onPasswordChange={setAuthPassword}
          onSubmit={() => (authMode === "login" ? login(authUsername, authPassword) : register(authUsername, authPassword))}
          onUsernameChange={setAuthUsername}
        />
        <NoticeOverlay message={notice} onDone={() => setNotice(null)} />
      </>
    );
  }

  if (!game) {
    if (screen === "main") {
      return (
        <>
          <MainMenuPage connected={connected} username={username} onLogout={logout} onOpenLobby={() => setScreen("lobby")} />
          <NoticeOverlay message={notice} onDone={() => setNotice(null)} />
        </>
      );
    }

    return (
      <>
        <LobbyPage
          connected={connected}
          manualRoomId={manualRoomId}
          rooms={rooms}
          username={username}
          onBackToMain={() => {
            setManualRoomId("");
            setScreen("main");
          }}
          onCreateRoom={(settings) => createRoom(username, settings)}
          onJoinManualRoom={(roomPassword) => joinRoom(manualRoomId.trim(), username, roomPassword)}
          onManualRoomIdChange={setManualRoomId}
          onJoinRoom={(room, roomPassword) => joinRoom(room.roomId, username, roomPassword)}
          onLogout={logout}
        />
        <NoticeOverlay message={notice} onDone={() => setNotice(null)} />
      </>
    );
  }

  const players = game.players ?? emptyPlayers;
  const myPlayer = players.find((player) => player.id === username) ?? players[0] ?? null;
  const viewingPlayer = players.find((player) => player.id === viewingPlayerId) ?? myPlayer;
  const viewingPlayerColor = getPlayerColorById(players, viewingPlayer?.id);
  const fieldSubmitted = Boolean(game.harvestField?.submittedPlayerIds.includes(username));
  const feedingSubmitted = Boolean(game.harvestFeeding?.submittedPlayerIds.includes(username));
  const breedingSubmitted = Boolean(game.harvestBreeding?.submittedPlayerIds.includes(username));

  if (game.phase === "CARD_DRAFT") {
    return (
      <>
        <CardDraftPage game={game} roomId={roomId} username={username} onLeave={() => setConfirmLeaveOpen(true)} />
        <ConfirmOverlay
          open={confirmLeaveOpen}
          title="退出房间"
          message="确认退出房间吗？退出后将返回大厅。"
          onCancel={() => setConfirmLeaveOpen(false)}
          onConfirm={() => {
            setConfirmLeaveOpen(false);
            if (roomId) leaveRoom(roomId);
          }}
        />
        <NoticeOverlay message={notice} onDone={() => setNotice(null)} />
      </>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>农家乐轻量版</h1>
          <p className="muted">
            房间 {roomId} / 玩家 {username}
          </p>
        </div>
        <div className="status-line">
          <span className={connected ? "pill ok" : "pill"}>连接：{connected ? "已连接" : "未连接"}</span>
          <span className="pill">第 {game.round} 轮</span>
          <span className="pill">{translatePhase(game.phase)}</span>
          {roomId === "admin-test" ? <span className="pill ok">测试房</span> : null}
          {game.phase === "WAITING" && roomId && myPlayer ? (
            <>
              {game.hostPlayerId === username ? (
                <>
                  <button className="secondary-button" onClick={() => addComputerPlayer(roomId)} disabled={game.players.length >= 6}>
                    添加电脑玩家
                  </button>
                  <button onClick={() => startGame(roomId)} disabled={game.players.length < 2 || game.readyPlayerIds.length !== game.players.length}>
                    开始游戏
                  </button>
                </>
              ) : (
                <button
                  className={game.readyPlayerIds.includes(username) ? "secondary-button" : ""}
                  onClick={() => setPlayerReady(roomId, username, !game.readyPlayerIds.includes(username))}
                >
                  {game.readyPlayerIds.includes(username) ? "取消准备" : "准备"}
                </button>
              )}
            </>
          ) : null}
          {game.phase === "GAME_END" && roomId ? (
            <button disabled={game.gameEndConfirmedPlayerIds.includes(username)} onClick={() => confirmGameEnd(roomId, username)}>
              {game.gameEndConfirmedPlayerIds.includes(username) ? "已确认结算" : "确认结算"}
            </button>
          ) : null}
          <button className="secondary-button" onClick={() => setConfirmLeaveOpen(true)}>
            退出房间
          </button>
        </div>
      </header>
      <ScoringGuide />

      <section className="game-layout">
        <aside className="left-rail">
          <section className="panel player-rail">
            <h2>玩家</h2>
            <p className="muted">点击头像切换查看农场和资源。</p>
            <div className="avatar-list">
              {players.map((player, index) => (
                <button
                  key={player.id}
                  className={player.id === viewingPlayer?.id ? "avatar-card active" : "avatar-card"}
                  style={{ ["--player-color" as string]: getPlayerColor(index) }}
                  onClick={() => setViewingPlayerId(player.id)}
                >
                  <span className="avatar-icon" style={{ backgroundColor: getPlayerColor(index) }}>
                    {index + 1}
                  </span>
                  <span>
                    {player.name}
                    {player.isComputer ? "（电脑）" : ""}
                    {player.id === username ? "（我）" : ""}
                  </span>
                  {game.phase === "WAITING" ? (
                    <span className={game.readyPlayerIds.includes(player.id) ? "player-ready-badge" : "player-waiting-badge"}>
                      {player.id === game.hostPlayerId ? "房主" : game.readyPlayerIds.includes(player.id) ? "已准备" : "未准备"}
                    </span>
                  ) : null}
                  <small>
                    {player.id === game.startingPlayer ? (
                      <span className="starting-player-mark" title="起始玩家">
                        <RESOURCE_ICONS.starting size={18} />
                      </span>
                    ) : null}
                    {player.workers.length} 工人 / {player.resources.food} 食物
                  </small>
                  <strong className="avatar-score">实时 {calculateLiveScore(player).total} 分</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="player-overview-card">
            <header className="player-overview-card__header">
              <div>
                <h2>{viewingPlayer?.name ?? "玩家"} 的面板</h2>
                <p className="muted">{viewingPlayer?.id === username ? "自己的农场和资源" : "正在查看其他玩家"}</p>
              </div>
            </header>
            <Farm player={viewingPlayer ?? null} isOwnFarm={Boolean(viewingPlayer && viewingPlayer.id === username)} playerColor={viewingPlayerColor} />
            <Resources game={game} isOwnPlayer={Boolean(viewingPlayer && viewingPlayer.id === username)} player={viewingPlayer ?? null} roomId={roomId} />
          </section>
        </aside>

        <section className="center-table">
          <Board onSelfAction={() => setViewingPlayerId(username)} />
        </section>

        <aside className="right-rail">
          {roomId === "admin-test" && myPlayer ? <AdminTestPanel roomId={roomId} player={myPlayer} /> : null}
          <OperationLog />
        </aside>
      </section>

      <NoticeOverlay message={notice ?? game.lastError} onDone={() => setNotice(null)} />
      <FinalScoreReveal game={game} />
      <ConfirmOverlay
        open={confirmLeaveOpen}
        title="退出房间"
        message={game.phase === "GAME_END" ? "确认离开结算房间吗？离开后房间会在所有玩家确认后关闭。" : "确认退出房间吗？退出后将返回大厅。"}
        onCancel={() => setConfirmLeaveOpen(false)}
        onConfirm={() => {
          setConfirmLeaveOpen(false);
          if (game.phase === "GAME_END" && roomId) {
            confirmGameEnd(roomId, username);
            setScreen("lobby");
            return;
          }
          setScreen("lobby");
          if (roomId) leaveRoom(roomId);
        }}
      />
      <HarvestFieldOverlay
        harvestedByPlayerId={game.harvestField?.harvestedByPlayerId ?? {}}
        onSubmit={() => roomId && submitHarvestField(roomId, username)}
        open={game.phase === "HARVEST" && Boolean(game.harvestField)}
        players={players}
        submitted={fieldSubmitted}
        submittedPlayerIds={game.harvestField?.submittedPlayerIds ?? []}
        username={username}
      />
      <HarvestFeedingOverlay
        cookedAnimals={feedingCookedAnimals}
        grainToFood={grainToFood}
        harvestConversions={harvestConversions}
        onCookedAnimalsChange={setFeedingCookedAnimals}
        onGrainToFoodChange={setGrainToFood}
        onHarvestConversionsChange={setHarvestConversions}
        onSubmit={() =>
          roomId &&
          submitHarvestFeeding(
            roomId,
            username,
            grainToFood,
            vegetableToFood,
            feedingCookedAnimals,
            [],
            Object.entries(harvestConversions).map(([key, count]) => {
              const [improvementId, conversionId] = key.split("::");
              return { improvementId, conversionId: conversionId || undefined, count };
            }),
          )
        }
        onVegetableToFoodChange={setVegetableToFood}
        open={game.phase === "HARVEST" && Boolean(game.harvestFeeding)}
        player={myPlayer}
        players={players}
        submitted={feedingSubmitted}
        submittedPlayerIds={game.harvestFeeding?.submittedPlayerIds ?? []}
        vegetableToFood={vegetableToFood}
      />
      <HarvestBreedingOverlay
        birthsByPlayerId={game.harvestBreeding?.birthsByPlayerId ?? {}}
        cookedAnimals={breedingCookedAnimals}
        onCookedAnimalsChange={setBreedingCookedAnimals}
        onSubmit={() => {
          if (!roomId) return;
          const overflow = calculatePendingBirths(game, username, true);
          submitHarvestBreeding(roomId, username, {
            placements: breedingPlacements,
            cooked: breedingCookedAnimals,
            discarded: overflow
              .filter((item) => item.count - getCookedAnimalCount(breedingCookedAnimals, item.animal) - getPlacedAnimalCount(breedingPlacements, item.animal) > 0)
              .map((item) => ({
                animal: item.animal,
                count: item.count - getCookedAnimalCount(breedingCookedAnimals, item.animal) - getPlacedAnimalCount(breedingPlacements, item.animal),
              })),
          });
        }}
        onPlacementsChange={setBreedingPlacements}
        open={game.phase === "HARVEST" && game.stage === "HARVEST_BREEDING" && Boolean(game.harvestBreeding)}
        pendingBirths={calculatePendingBirths(game, username, true)}
        placements={breedingPlacements}
        player={myPlayer}
        players={players}
        submitted={breedingSubmitted}
        submittedPlayerIds={game.harvestBreeding?.submittedPlayerIds ?? []}
        username={username}
      />
    </main>
  );
}

function AuthPage({
  authMode,
  connected,
  onModeChange,
  onPasswordChange,
  onSubmit,
  onUsernameChange,
  password,
  username,
}: {
  authMode: "login" | "register";
  connected: boolean;
  password: string;
  username: string;
  onModeChange: (mode: "login" | "register") => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onUsernameChange: (username: string) => void;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>农场桌面</h1>
        <p className="muted">登录账号后进入游戏。</p>
        <div className="segmented">
          <button className={authMode === "login" ? "active" : ""} onClick={() => onModeChange("login")}>
            登录
          </button>
          <button className={authMode === "register" ? "active" : ""} onClick={() => onModeChange("register")}>
            注册
          </button>
        </div>
        <input value={username} onChange={(event) => onUsernameChange(event.target.value)} placeholder="用户名" />
        <input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} placeholder="密码" />
        <button onClick={onSubmit}>{authMode === "login" ? "登录" : "注册并登录"}</button>
        <p className="muted">连接状态：{connected ? "已连接" : "未连接"}</p>
      </section>
    </main>
  );
}

function MainMenuPage({ connected, onLogout, onOpenLobby, username }: { connected: boolean; username: string; onLogout: () => void; onOpenLobby: () => void }) {
  return (
    <main className="app-shell menu-shell">
      <header className="home-hero">
        <h1>农家乐轻量版</h1>
        <div className="account-line">
          <p>账号：{username}</p>
          <button className="secondary-button" onClick={onLogout}>
            登出账号
          </button>
        </div>
        <span className={connected ? "pill ok" : "pill"}>连接：{connected ? "已连接" : "未连接"}</span>
      </header>
      <section className="panel main-menu">
        <h2>主菜单</h2>
        <button onClick={onOpenLobby}>进入游戏大厅</button>
      </section>
    </main>
  );
}

function LobbyPage({
  connected,
  manualRoomId,
  onBackToMain,
  onCreateRoom,
  onJoinManualRoom,
  onJoinRoom,
  onLogout,
  onManualRoomIdChange,
  rooms,
  username,
}: {
  connected: boolean;
  manualRoomId: string;
  rooms: RoomListItem[];
  username: string;
  onBackToMain: () => void;
  onCreateRoom: (settings: { enableCardDraft: boolean; roomPassword: string; draftTimeLimitMinutes: number | null }) => void;
  onJoinManualRoom: (roomPassword: string) => void;
  onManualRoomIdChange: (roomId: string) => void;
  onJoinRoom: (room: RoomListItem, roomPassword: string) => void;
  onLogout: () => void;
}) {
  const visibleRooms = rooms.filter((room) => /^\d+$/.test(room.roomId) && room.phase === "WAITING");
  const testRooms = rooms.filter((room) => room.isTestRoom);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [joinPasswordRoom, setJoinPasswordRoom] = useState<RoomListItem | null>(null);

  return (
    <main className="app-shell">
      <header className="home-hero">
        <div>
          <h1>游戏大厅</h1>
          <p>玩家：{username}</p>
        </div>
        <div className="status-line">
          <span className={connected ? "pill ok" : "pill"}>连接：{connected ? "已连接" : "未连接"}</span>
          <button className="secondary-button" onClick={onBackToMain}>
            返回主菜单
          </button>
          <button className="secondary-button" onClick={onLogout}>
            登出账号
          </button>
        </div>
      </header>
      <section className="panel lobby-page">
        <div className="lobby-head">
          <div>
            <h2>当前房间</h2>
            <p className="muted">只显示等待中的可加入房间。</p>
          </div>
          <div className="create-room-controls">
            <button onClick={() => setCreateRoomOpen(true)}>创建房间</button>
          </div>
        </div>
        <div className="manual-join">
          <input value={manualRoomId} onChange={(event) => onManualRoomIdChange(event.target.value)} placeholder="输入房间编号" />
          <button onClick={() => manualRoomId.trim() && setJoinPasswordRoom({ roomId: manualRoomId.trim(), phase: "WAITING", round: 0, enableCardDraft: false, players: [] })}>加入房间</button>
        </div>
        <div className="room-list">
          {testRooms.map((room) => (
            <button key={room.roomId} className="room-card room-card--test" onClick={() => onJoinRoom(room, "")}>
              <span className="room-number">测试房</span>
              <span>{translatePhase(room.phase)} / 第 {room.round} 轮</span>
              <small>仅管理员可见，可重开、推进回合、调整资源</small>
              <strong>进入测试房</strong>
            </button>
          ))}
          {visibleRooms.length === 0 ? (
            testRooms.length === 0 ? <p className="muted">当前没有可加入房间。</p> : null
          ) : (
            visibleRooms.map((room) => (
              <button key={room.roomId} className="room-card" onClick={() => (room.hasRoomPassword ? setJoinPasswordRoom(room) : onJoinRoom(room, ""))}>
                <span className="room-number">#{room.roomId}</span>
                <span>{translatePhase(room.phase)}</span>
                <small>
                  {room.players.length} 人 / 第 {room.round} 轮 / {room.enableCardDraft ? "轮抽" : "普通发牌"}
                </small>
                <small>{room.hasRoomPassword ? "已设密码" : "公开房间"}{room.draftTimeLimitMinutes ? ` / 轮抽 ${room.draftTimeLimitMinutes} 分钟` : " / 轮抽无限时"}</small>
                <strong>点击加入</strong>
              </button>
            ))
          )}
        </div>
      </section>
      <CreateRoomModal
        open={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
        onCreate={(settings) => {
          onCreateRoom(settings);
          setCreateRoomOpen(false);
        }}
      />
      <JoinRoomPasswordModal
        open={Boolean(joinPasswordRoom)}
        roomId={joinPasswordRoom?.roomId ?? ""}
        onClose={() => setJoinPasswordRoom(null)}
        onJoin={(roomPassword) => {
          const room = joinPasswordRoom;
          setJoinPasswordRoom(null);
          if (!room) return;
          if (room.roomId === manualRoomId.trim()) {
            onJoinManualRoom(roomPassword);
            return;
          }
          onJoinRoom(room, roomPassword);
        }}
      />
    </main>
  );
}

function CreateRoomModal({
  onClose,
  onCreate,
  open,
}: {
  onClose: () => void;
  onCreate: (settings: { enableCardDraft: boolean; roomPassword: string; draftTimeLimitMinutes: number | null }) => void;
  open: boolean;
}) {
  const [enableCardDraft, setEnableCardDraft] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [draftTimeLimitText, setDraftTimeLimitText] = useState("");

  if (!open) return null;
  const draftTimeLimitMinutes = draftTimeLimitText.trim() ? Math.max(0, Math.floor(Number(draftTimeLimitText))) : null;
  const canCreate = !draftTimeLimitText.trim() || Number.isFinite(Number(draftTimeLimitText));

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="create-room-title">
      <section className="game-modal room-settings-modal">
        <span className="game-modal__eyebrow">房间设置</span>
        <h2 id="create-room-title">创建房间</h2>
        <div className="room-settings-form">
          <label className="room-setting-row room-setting-row--toggle">
            <input type="checkbox" checked={enableCardDraft} onChange={(event) => setEnableCardDraft(event.target.checked)} />
            <span>
              <b>开启轮抽</b>
              <small>开局前先轮抽职业卡和小设施卡。</small>
            </span>
          </label>
          <label className="room-setting-row">
            <span>房间密码</span>
            <input type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="不填则公开" />
          </label>
          <label className="room-setting-row">
            <span>每轮轮抽时间</span>
            <input inputMode="numeric" min={0} type="number" value={draftTimeLimitText} onChange={(event) => setDraftTimeLimitText(event.target.value)} placeholder="无限时间" />
          </label>
          <p className="muted">单位为分钟；不填或填 0 表示无限时间。</p>
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button
            disabled={!canCreate}
            onClick={() =>
              onCreate({
                enableCardDraft,
                roomPassword,
                draftTimeLimitMinutes: draftTimeLimitMinutes && draftTimeLimitMinutes > 0 ? draftTimeLimitMinutes : null,
              })
            }
          >
            创建房间
          </button>
        </footer>
      </section>
    </div>
  );
}

function JoinRoomPasswordModal({
  onClose,
  onJoin,
  open,
  roomId,
}: {
  onClose: () => void;
  onJoin: (roomPassword: string) => void;
  open: boolean;
  roomId: string;
}) {
  const [roomPassword, setRoomPassword] = useState("");

  useEffect(() => {
    if (open) setRoomPassword("");
  }, [open, roomId]);

  if (!open) return null;
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="join-room-title">
      <section className="game-modal room-settings-modal">
        <span className="game-modal__eyebrow">加入房间</span>
        <h2 id="join-room-title">房间 #{roomId}</h2>
        <div className="room-settings-form">
          <label className="room-setting-row">
            <span>房间密码</span>
            <input type="password" value={roomPassword} onChange={(event) => setRoomPassword(event.target.value)} placeholder="没有密码可留空" autoFocus />
          </label>
        </div>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button onClick={() => onJoin(roomPassword)}>加入房间</button>
        </footer>
      </section>
    </div>
  );
}

function CardDraftPage({ game, onLeave, roomId, username }: { game: NonNullable<ReturnType<typeof useGameStore.getState>["game"]>; roomId: string | null; username: string; onLeave: () => void }) {
  const player = game.players.find((candidate) => candidate.id === username) ?? null;
  const pack = game.cardDraft?.packs.find((candidate) => candidate.playerId === username) ?? null;
  const submitted = Boolean(game.cardDraft?.pendingSelections[username]);
  const [selectedMinorId, setSelectedMinorId] = useState<string | null>(null);
  const [selectedOccupationId, setSelectedOccupationId] = useState<string | null>(null);
  const minorCards = pack?.minorImprovementIds.map((id) => getMinorImprovement(id)).filter((card): card is NonNullable<ReturnType<typeof getMinorImprovement>> => Boolean(card)) ?? [];
  const occupationCards = pack?.occupationIds.map((id) => getOccupation(id)).filter((card): card is NonNullable<ReturnType<typeof getOccupation>> => Boolean(card)) ?? [];
  const ready = Boolean(roomId && player && selectedMinorId && selectedOccupationId && !submitted);
  const submittedCount = Object.keys(game.cardDraft?.pendingSelections ?? {}).length;
  const totalPlayers = game.players.length;

  useEffect(() => {
    setSelectedMinorId(null);
    setSelectedOccupationId(null);
  }, [game.cardDraft?.round, pack?.minorImprovementIds.join("|"), pack?.occupationIds.join("|")]);

  return (
    <main className="app-shell draft-shell">
      <header className="topbar">
        <div>
          <h1>轮抽选牌</h1>
          <p className="muted">
            房间 {roomId} / 第 {game.cardDraft?.round ?? 1} 轮 / 玩家 {username}
          </p>
        </div>
        <div className="status-line">
          <span className="pill ok">轮抽中</span>
          <span className="pill">已提交 {submittedCount}/{totalPlayers}</span>
          <button className="secondary-button" onClick={onLeave}>
            退出房间
          </button>
        </div>
      </header>

      <section className="panel draft-panel">
        <div className="draft-summary">
          <div>
            <h2>选择 1 张小设施和 1 张职业</h2>
            <p className="muted">所有玩家提交后，剩余牌包会传给下一名玩家；最后一名传给第一名。选满 7+7 后正式开始第 1 轮。</p>
          </div>
          <div className="draft-progress">
            <strong>{player ? `${player.minorImprovementHand.length}/7 小设施` : "0/7 小设施"}</strong>
            <strong>{player ? `${player.occupationHand.length}/7 职业` : "0/7 职业"}</strong>
          </div>
        </div>

        {submitted ? <p className="draft-waiting">本轮选择已提交，等待其他玩家。</p> : null}

        <div className="draft-columns">
          <DraftCardColumn
            cards={minorCards}
            kind="minor"
            selectedId={selectedMinorId}
            title="小设施牌包"
            onSelect={setSelectedMinorId}
          />
          <DraftCardColumn
            cards={occupationCards}
            kind="occupation"
            selectedId={selectedOccupationId}
            title="职业牌包"
            onSelect={setSelectedOccupationId}
          />
        </div>

        <footer className="game-modal__actions draft-actions">
          <button
            disabled={!ready}
            onClick={() => {
              if (!roomId || !player || !selectedMinorId || !selectedOccupationId) return;
              submitCardDraftPick(roomId, player.id, selectedMinorId, selectedOccupationId);
            }}
          >
            提交本轮选择
          </button>
        </footer>
      </section>
    </main>
  );
}

function DraftCardColumn({
  cards,
  kind,
  onSelect,
  selectedId,
  title,
}: {
  cards: PlayableCardDefinition[];
  kind: PlayableCardKind;
  selectedId: string | null;
  title: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="draft-column">
      <h3>{title}</h3>
      <div className="draft-card-list">
        {cards.length === 0 ? <p className="muted">当前没有可选牌。</p> : null}
        {cards.map((card) => (
          <button key={card.id} className={card.id === selectedId ? "draft-card selected" : "draft-card"} onClick={() => onSelect(card.id)}>
            <PlayableCardFace card={card} kind={kind} footer={<span className="playable-card__status">选择</span>} />
          </button>
        ))}
      </div>
    </section>
  );
}

function AdminTestPanel({ player, roomId }: { player: Player; roomId: string }) {
  const [cardLibraryOpen, setCardLibraryOpen] = useState(false);
  const items: Array<{ key: AdminAdjustKey; label: string; icon: keyof typeof RESOURCE_ICONS; count: number }> = [
    { key: "wood", label: "木材", icon: "wood", count: player.resources.wood },
    { key: "clay", label: "黏土", icon: "clay", count: player.resources.clay },
    { key: "reed", label: "芦苇", icon: "reed", count: player.resources.reed },
    { key: "stone", label: "石头", icon: "stone", count: player.resources.stone },
    { key: "food", label: "食物", icon: "food", count: player.resources.food },
    { key: "grain", label: "谷物", icon: "grain", count: player.resources.grain },
    { key: "vegetable", label: "蔬菜", icon: "vegetable", count: player.resources.vegetable },
    { key: "sheep", label: "羊", icon: "sheep", count: player.animals.sheep },
    { key: "boar", label: "野猪", icon: "boar", count: player.animals.boar },
    { key: "cattle", label: "牛", icon: "cattle", count: player.animals.cattle },
    { key: "begging", label: "乞讨", icon: "begging", count: player.beggingCards },
  ];

  return (
    <section className="panel admin-test-panel">
      <header className="admin-test-panel__header">
        <div>
          <h2>测试控制</h2>
          <p className="muted">仅管理员测试房可用。</p>
        </div>
      </header>
      <div className="admin-test-panel__actions">
        <button onClick={() => restartAdminTestRoom(roomId)}>重开测试房</button>
        <button className="secondary-button" onClick={() => advanceAdminRound(roomId)}>
          推进回合
        </button>
        <button className="secondary-button" onClick={() => startAdminHarvest(roomId)}>
          进入收获阶段
        </button>
        <button className="secondary-button" onClick={() => setCardLibraryOpen(true)}>
          查看并添加卡牌
        </button>
      </div>
      <div className="admin-resource-editor">
        {items.map((item) => {
          const Icon = RESOURCE_ICONS[item.icon];
          return (
            <div key={item.key} className="admin-resource-editor__row">
              <span>
                <Icon size={24} />
                {item.label}
              </span>
              <strong>{item.count}</strong>
              <button className="secondary-button" onClick={() => adjustAdminResource(roomId, player.id, item.key, -1)}>
                -1
              </button>
              <button onClick={() => adjustAdminResource(roomId, player.id, item.key, 1)}>+1</button>
              <button onClick={() => adjustAdminResource(roomId, player.id, item.key, 5)}>+5</button>
            </div>
          );
        })}
      </div>
      {cardLibraryOpen ? <AdminCardLibraryOverlay player={player} roomId={roomId} onClose={() => setCardLibraryOpen(false)} /> : null}
    </section>
  );
}

function AdminCardLibraryOverlay({ player, roomId, onClose }: { player: Player; roomId: string; onClose: () => void }) {
  const [kind, setKind] = useState<PlayableCardKind>("minor");
  const cards: PlayableCardDefinition[] = kind === "minor" ? minorImprovements : occupations;
  const hand = kind === "minor" ? player.minorImprovementHand : player.occupationHand;

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <section className="game-modal admin-card-library-modal">
        <h2>测试卡牌库</h2>
        <div className="admin-card-library-tabs">
          <button className={kind === "minor" ? "selected" : ""} onClick={() => setKind("minor")}>
            小设施
          </button>
          <button className={kind === "occupation" ? "selected" : ""} onClick={() => setKind("occupation")}>
            职业
          </button>
        </div>
        <div className="admin-card-library-grid">
          {cards.map((card) => {
            const alreadyInHand = hand.includes(card.id);
            return (
              <article key={card.id} className="admin-card-library-entry">
                <PlayableCardFace card={card} kind={kind} footer={<span className="playable-card__status">{alreadyInHand ? "已在手牌" : "测试添加"}</span>} />
                <button disabled={alreadyInHand} onClick={() => addAdminCardToHand(roomId, player.id, kind, card.id)}>
                  {alreadyInHand ? "已在手牌" : "加入手牌"}
                </button>
              </article>
            );
          })}
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

function NoticeOverlay({ message, onDone }: { message: string | null | undefined; onDone?: () => void }) {
  const [displayMessage, setDisplayMessage] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!message) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setDisplayMessage(message);
    timerRef.current = window.setTimeout(() => {
      setDisplayMessage(null);
      onDoneRef.current?.();
      timerRef.current = null;
    }, 1400);
  }, [message]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (!displayMessage) return null;
  return (
    <div className="modal-layer modal-layer--notice" role="status" aria-live="polite">
      <section className="game-modal game-modal--notice">
        <span className="game-modal__eyebrow">提示</span>
        <strong>{displayMessage}</strong>
      </section>
    </div>
  );
}

function ConfirmOverlay({
  message,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) return null;
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <section className="game-modal">
        <span className="game-modal__eyebrow">确认</span>
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <footer className="game-modal__actions">
          <button className="secondary-button" onClick={onCancel}>
            取消
          </button>
          <button onClick={onConfirm}>确认</button>
        </footer>
      </section>
    </div>
  );
}

function HarvestFieldOverlay({
  harvestedByPlayerId,
  onSubmit,
  open,
  players,
  submitted,
  submittedPlayerIds,
  username,
}: {
  harvestedByPlayerId: Record<string, { grain: number; vegetable: number }>;
  onSubmit: () => void;
  open: boolean;
  players: Player[];
  submitted: boolean;
  submittedPlayerIds: string[];
  username: string;
}) {
  if (!open) return null;
  const mine = harvestedByPlayerId[username] ?? { grain: 0, vegetable: 0 };
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="harvest-field-title">
      <section className="game-modal harvest-modal">
        <span className="game-modal__eyebrow">收获阶段 1/3</span>
        <h2 id="harvest-field-title">收获田地</h2>
        <p>每块已播种田地收获 1 个作物到资源区。</p>
        <div className="harvest-summary">
          <ResourceBadge type="grain" label="本次小麦" count={mine.grain} />
          <ResourceBadge type="vegetable" label="本次蔬菜" count={mine.vegetable} />
        </div>
        <HarvestProgress players={players} submittedPlayerIds={submittedPlayerIds} />
        {submitted ? <strong className="harvest-waiting">已确认，等待其他玩家。</strong> : <button onClick={onSubmit}>确认收获</button>}
      </section>
    </div>
  );
}

function HarvestFeedingOverlay({
  cookedAnimals,
  grainToFood,
  harvestConversions,
  onCookedAnimalsChange,
  onGrainToFoodChange,
  onHarvestConversionsChange,
  onSubmit,
  onVegetableToFoodChange,
  open,
  player,
  players,
  submitted,
  submittedPlayerIds,
  vegetableToFood,
}: {
  cookedAnimals: AnimalCookInput[];
  grainToFood: number;
  harvestConversions: Record<string, number>;
  onCookedAnimalsChange: (value: AnimalCookInput[]) => void;
  onGrainToFoodChange: (value: number) => void;
  onHarvestConversionsChange: (value: Record<string, number>) => void;
  onSubmit: () => void;
  onVegetableToFoodChange: (value: number) => void;
  open: boolean;
  player: Player | null;
  players: Player[];
  submitted: boolean;
  submittedPlayerIds: string[];
  vegetableToFood: number;
}) {
  const options = player ? getHarvestConversionOptions(player) : [];
  useEffect(() => {
    if (!open || !player || submitted) return;
    onGrainToFoodChange(clampNumber(grainToFood, 0, player.resources.grain));
    onVegetableToFoodChange(clampNumber(vegetableToFood, 0, player.resources.vegetable));
    const normalized = options.reduce<Record<string, number>>((next, option) => {
      const count = clampNumber(harvestConversions[option.optionKey] ?? 0, 0, option.max);
      if (count > 0) next[option.optionKey] = count;
      return next;
    }, {});
    if (JSON.stringify(normalized) !== JSON.stringify(harvestConversions)) {
      onHarvestConversionsChange(normalized);
    }
  }, [
    open,
    player?.id,
    player?.resources.grain,
    player?.resources.vegetable,
    player?.resources.wood,
    player?.resources.clay,
    player?.resources.reed,
    harvestConversions,
    onHarvestConversionsChange,
    onGrainToFoodChange,
    onVegetableToFoodChange,
    options,
    submitted,
  ]);

  if (!open || !player) return null;

  const normalizedGrain = clampNumber(grainToFood, 0, player.resources.grain);
  const normalizedVegetable = clampNumber(vegetableToFood, 0, player.resources.vegetable);
  const cookedFood = cookedAnimals.reduce((sum, item) => sum + item.count * cookValue(player, item.animal), 0);
  const harvestConversionFood = options.reduce((sum, option) => sum + clampNumber(harvestConversions[option.optionKey] ?? 0, 0, option.max) * option.food, 0);
  const foodAfterConversion = player.resources.food + normalizedGrain + normalizedVegetable + cookedFood + harvestConversionFood;
  const requiredFood = player.workers.length * 2;
  const beggingCards = Math.max(0, requiredFood - foodAfterConversion);
  const paidFood = Math.min(foodAfterConversion, requiredFood);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="harvest-feeding-title">
      <section className="game-modal harvest-modal">
        <span className="game-modal__eyebrow">收获阶段 2/3</span>
        <h2 id="harvest-feeding-title">家庭喂食</h2>
        <p>选择是否把资源区的谷物、蔬菜或动物转换为食物。</p>
        <div className="harvest-controls">
          <HarvestConvertControl icon={<RESOURCE_ICONS.grain size={24} />} label="谷物转食物" max={player.resources.grain} onChange={onGrainToFoodChange} value={normalizedGrain} disabled={submitted} />
          <HarvestConvertControl icon={<RESOURCE_ICONS.vegetable size={24} />} label="蔬菜转食物" max={player.resources.vegetable} onChange={onVegetableToFoodChange} value={normalizedVegetable} disabled={submitted} />
        </div>
        <HarvestMajorConversionPanel disabled={submitted} onChange={onHarvestConversionsChange} options={options} value={harvestConversions} />
        <AnimalCookPanel
          cookedAnimals={cookedAnimals}
          disabled={submitted || !canCookAnimal(player)}
          onChange={onCookedAnimalsChange}
          player={player}
        />
        <div className="harvest-summary">
          <ResourceBadge type="food" label="当前" count={player.resources.food} />
          <ResourceBadge type="food" label="转换后" count={foodAfterConversion} />
          <ResourceBadge type="food" label="烹饪" count={cookedFood} />
          <ResourceBadge type="food" label="卡牌转换" count={harvestConversionFood} />
          <ResourceBadge type="food" label="需要" count={requiredFood} />
          <FeedingCostBadge paidFood={paidFood} beggingCards={beggingCards} />
        </div>
        <HarvestProgress players={players} submittedPlayerIds={submittedPlayerIds} />
        {submitted ? <strong className="harvest-waiting">已确认，等待其他玩家。</strong> : <button onClick={onSubmit}>确认喂食</button>}
      </section>
    </div>
  );
}

function HarvestBreedingOverlay({
  birthsByPlayerId,
  cookedAnimals,
  onCookedAnimalsChange,
  onPlacementsChange,
  onSubmit,
  open,
  pendingBirths,
  placements,
  player,
  players,
  submitted,
  submittedPlayerIds,
  username,
}: {
  birthsByPlayerId: Record<string, Partial<Record<Animal, number>>>;
  cookedAnimals: AnimalCookInput[];
  onCookedAnimalsChange: (value: AnimalCookInput[]) => void;
  onPlacementsChange: (value: AnimalOverflowResolution["placements"]) => void;
  onSubmit: () => void;
  open: boolean;
  pendingBirths: AnimalCookInput[];
  placements: AnimalOverflowResolution["placements"];
  player: Player | null;
  players: Player[];
  submitted: boolean;
  submittedPlayerIds: string[];
  username: string;
}) {
  if (!open || !player) return null;
  const myBirths = formatAnimalCounts(birthsByPlayerId[username] ?? {});
  const hasOverflow = pendingBirths.length > 0;

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="harvest-breeding-title">
      <section className="game-modal harvest-modal">
        <span className="game-modal__eyebrow">收获阶段 3/3</span>
        <h2 id="harvest-breeding-title">动物繁殖</h2>
        <p>{hasOverflow ? "有新生动物暂时没有空间，请选择烹饪或丢弃，之后再确认。" : "查看本轮繁殖结果，然后确认进入下一步。"}</p>
        <div className="harvest-summary">
          {myBirths.length > 0 ? myBirths.map((item) => <ResourceBadge key={item.animal} type={item.animal} label="繁殖" count={item.count} />) : <span>本轮没有新增动物</span>}
        </div>
        {hasOverflow ? (
          <>
            <div className="harvest-summary harvest-summary--warning">
              {pendingBirths.map((item) => (
                <ResourceBadge key={item.animal} type={item.animal} label="待处理" count={item.count} />
              ))}
            </div>
            <BreedingPlacementPicker onChange={onPlacementsChange} pendingBirths={pendingBirths} placements={placements} player={player} />
            <AnimalCookPanel cookedAnimals={cookedAnimals} disabled={!canCookAnimal(player)} maxByAnimal={pendingBirths} onChange={onCookedAnimalsChange} player={player} />
            <p className="muted">未烹饪的新生动物会在确认时丢弃。</p>
          </>
        ) : null}
        <HarvestProgress players={players} submittedPlayerIds={submittedPlayerIds} />
        {submitted ? <strong className="harvest-waiting">已确认，等待其他玩家。</strong> : <button onClick={onSubmit}>确认繁殖</button>}
      </section>
    </div>
  );
}

function HarvestMajorConversionPanel({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  onChange: (value: Record<string, number>) => void;
  options: HarvestConversionOption[];
  value: Record<string, number>;
}) {
  if (options.length === 0) return null;
  return (
    <div className="harvest-major-conversion-panel">
      <strong>收获卡牌转换</strong>
      <div className="harvest-controls">
        {options.map((option) => {
          const ResourceIcon = RESOURCE_ICONS[option.resource];
          const current = clampNumber(value[option.optionKey] ?? 0, 0, option.max);
          return (
            <HarvestConvertControl
              key={option.optionKey}
              disabled={disabled || option.max <= 0}
              icon={<ResourceIcon size={24} />}
              label={option.cardName}
              max={option.max}
              value={current}
              onChange={(nextValue) => {
                const normalized = clampNumber(nextValue, 0, option.max);
                const next = { ...value };
                if (normalized > 0) {
                  next[option.optionKey] = normalized;
                } else {
                  delete next[option.optionKey];
                }
                onChange(next);
              }}
            />
          );
        })}
      </div>
      <div className="harvest-major-conversion-rules">
        {options.map((option) => {
          const ResourceIcon = RESOURCE_ICONS[option.resource];
          return (
            <span key={option.optionKey}>
              <ResourceIcon size={16} /> × {option.amount} → {option.outputResource && option.outputResource !== "food" ? <BadgeIcon type={option.outputResource} /> : <RESOURCE_ICONS.food size={16} />} × {option.outputAmount ?? option.food}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FeedingCostBadge({ beggingCards, paidFood }: { beggingCards: number; paidFood: number }) {
  return (
    <strong className="harvest-resource-badge harvest-resource-badge--combined">
      <span>
        <BadgeIcon type="food" />
        将消耗
        <b>{paidFood}</b>
      </span>
      <span>
        <BadgeIcon type="begging" />
        预计乞讨
        <b>{beggingCards}</b>
      </span>
    </strong>
  );
}

function AnimalCookPanel({
  cookedAnimals,
  disabled,
  maxByAnimal,
  onChange,
  player,
}: {
  cookedAnimals: AnimalCookInput[];
  disabled: boolean;
  maxByAnimal?: AnimalCookInput[];
  onChange: (value: AnimalCookInput[]) => void;
  player: Player;
}) {
  const [open, setOpen] = useState(false);
  const cookedTotal = cookedAnimals.reduce((sum, item) => sum + item.count, 0);
  const canCook = canCookAnimal(player);
  return (
    <div className="harvest-cook-panel">
      <button className="secondary-button" disabled={disabled} onClick={() => setOpen((value) => !value)}>
        烹饪动物{cookedTotal > 0 ? ` × ${cookedTotal}` : ""}
      </button>
      {!canCook ? <small className="muted">需要篝火或灶台</small> : null}
      {open && !disabled ? (
        <div className="harvest-controls">
          {(["sheep", "boar", "cattle"] as const).map((animal) => {
            const max = maxByAnimal?.find((item) => item.animal === animal)?.count ?? player.animals[animal];
            const value = getCookedAnimalCount(cookedAnimals, animal);
            return (
              <HarvestConvertControl
                key={animal}
                disabled={max <= 0}
                icon={<AnimalIcon animal={animal} size={24} />}
                label={`${translateAnimalName(animal)}烹饪`}
                max={max}
                value={value}
                onChange={(nextValue) => onChange(setCookedAnimalCount(cookedAnimals, animal, nextValue))}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function BreedingPlacementPicker({
  onChange,
  pendingBirths,
  placements,
  player,
}: {
  onChange: (value: AnimalOverflowResolution["placements"]) => void;
  pendingBirths: AnimalCookInput[];
  placements: AnimalOverflowResolution["placements"];
  player: Player;
}) {
  const targets = pendingBirths.flatMap((birth) => getBreedingTargets(player, birth.animal));
  if (targets.length === 0) {
    return <p className="muted">没有其他可安置空间。</p>;
  }

  return (
    <div className="breeding-placement-list">
      {targets.map((target) => {
        const key = placementKey(target.placement);
        const selected = placements.some((item) => placementKey(item) === key);
        const pending = pendingBirths.find((item) => item.animal === target.animal)?.count ?? 0;
        const placedForAnimal = getPlacedAnimalCount(placements, target.animal);
        const disabled = !selected && placedForAnimal >= pending;
        return (
          <button
            key={key}
            className={selected ? "secondary-button active" : "secondary-button"}
            disabled={disabled}
            onClick={() => {
              onChange(selected ? placements.filter((item) => placementKey(item) !== key) : [...placements, target.placement]);
            }}
          >
            <AnimalIcon animal={target.animal} size={22} />
            {target.label}
          </button>
        );
      })}
    </div>
  );
}

function HarvestConvertControl({
  disabled,
  icon,
  label,
  max,
  onChange,
  value,
}: {
  disabled: boolean;
  icon?: ReactNode;
  label: string;
  max: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="harvest-control harvest-control--with-icon">
      {icon}
      <span>
        {label}
        <small>最多 {max}</small>
      </span>
      <input disabled={disabled} max={max} min="0" type="number" value={value} onChange={(event) => onChange(clampNumber(Number(event.target.value), 0, max))} />
    </label>
  );
}

function HarvestProgress({ players, submittedPlayerIds }: { players: Player[]; submittedPlayerIds: string[] }) {
  return (
    <div className="harvest-progress">
      {players.map((candidate, index) => (
        <span key={candidate.id} className={submittedPlayerIds.includes(candidate.id) ? "harvest-progress__player done" : "harvest-progress__player"} style={{ ["--player-color" as string]: getPlayerColor(index) }}>
          {candidate.name}
        </span>
      ))}
    </div>
  );
}

function ResourceBadge({ count, label, strong, type }: { count: number; label: string; strong?: boolean; type: BadgeType }) {
  const content = (
    <>
      <BadgeIcon type={type} />
      <span>{label}</span>
      <b>{count}</b>
    </>
  );
  return strong ? <strong className="harvest-resource-badge">{content}</strong> : <span className="harvest-resource-badge">{content}</span>;
}

function BadgeIcon({ type }: { type: BadgeType }) {
  if (type === "sheep" || type === "boar" || type === "cattle") return <AnimalIcon animal={type} size={22} />;
  const Icon = RESOURCE_ICONS[type];
  return <Icon size={22} />;
}

function AnimalIcon({ animal, size }: { animal: Animal; size: number }) {
  const Icon = RESOURCE_ICONS[animal];
  return <Icon size={size} />;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function getCookedAnimalCount(cookedAnimals: AnimalCookInput[], animal: Animal): number {
  return cookedAnimals.find((item) => item.animal === animal)?.count ?? 0;
}

function setCookedAnimalCount(cookedAnimals: AnimalCookInput[], animal: Animal, count: number): AnimalCookInput[] {
  const next = cookedAnimals.filter((item) => item.animal !== animal);
  if (count > 0) next.push({ animal, count });
  return next;
}

function getPlacedAnimalCount(placements: AnimalOverflowResolution["placements"], animal: Animal): number {
  return placements.reduce((sum, placement) => sum + ("animal" in placement && placement.animal === animal ? placement.count : 0), 0);
}

function placementKey(placement: AnimalOverflowResolution["placements"][number]): string {
  if (placement.type === "house") return `house:${"animal" in placement ? placement.animal ?? "animal" : "animal"}`;
  if (placement.type === "stable") return `stable:${placement.row}:${placement.col}:${placement.animal ?? "animal"}`;
  return `pasture:${placement.pastureId}:${placement.row}:${placement.col}:${placement.animal ?? "animal"}`;
}

function getBreedingTargets(player: Player, animal: Animal): Array<{ animal: Animal; label: string; placement: AnimalOverflowResolution["placements"][number] }> {
  const targets: Array<{ animal: Animal; label: string; placement: AnimalOverflowResolution["placements"][number] }> = [];
  if (player.farm.animalHousing.house.count === 0) {
    targets.push({ animal, label: `${translateAnimalName(animal)} 放入房屋`, placement: { type: "house", count: 1 } });
  }
  player.farm.animalHousing.stables.forEach((stable) => {
    if (stable.count === 0 || stable.animal === animal) {
      const cell = player.farm.cells.find((item) => item.row === stable.row && item.col === stable.col);
      if (!cell?.pastureId && stable.count < 1) {
        targets.push({
          animal,
          label: `${translateAnimalName(animal)} 放入马厩 ${stable.col},${stable.row}`,
          placement: { type: "stable", row: stable.row, col: stable.col, count: 1, animal },
        });
      }
    }
  });
  player.farm.pastures.forEach((pasture) => {
    if ((pasture.animalType && pasture.animalType !== animal) || pasture.animalCount >= pasture.capacity) return;
    pasture.cells.forEach((cell) => {
      targets.push({
        animal,
        label: `${translateAnimalName(animal)} 放入牧场 ${cell.col},${cell.row}`,
        placement: { type: "pasture", pastureId: pasture.id, row: cell.row, col: cell.col, count: 1, animal },
      });
    });
  });
  return targets;
}

function getHarvestConversionOptions(player: Player): HarvestConversionOption[] {
  const majorOptions = player.majorImprovements.flatMap((cardId) => {
    const card = majorImprovements.find((candidate) => candidate.id === cardId);
    if (!card) return [];
    const effect = card.effects.find((candidate) => candidate.type === "harvestConvert");
    if (!effect || effect.type !== "harvestConvert" || !isBadgeType(effect.resource)) return [];
    const max = player.resources[effect.resource] >= effect.amount ? 1 : 0;
    return [
      {
        cardId: card.id,
        optionKey: card.id,
        cardName: card.name,
        resource: effect.resource,
        amount: effect.amount,
        food: effect.food,
        max,
      },
    ];
  });
  const cardOptions = [...player.occupations, ...player.minorImprovements].flatMap((cardId) => {
    const card = getOccupation(cardId) ?? getMinorImprovement(cardId);
    if (!card) return [];
    return card.effects.flatMap((effect) => {
      if (effect.type !== "conversion" || (effect.timing !== "harvest" && effect.timing !== "anytime")) return [];
      const [fromResource, fromAmount] = firstBadgeEntry(effect.from);
      const [toResource, toAmount] = firstBadgeEntry(effect.to);
      if (!fromResource || !fromAmount || !toResource || !toAmount) return [];
      const sourceAmount = isAnimal(fromResource) ? player.animals[fromResource] : isPlayerResource(fromResource) ? player.resources[fromResource] : 0;
      return [
        {
          cardId: card.id,
          conversionId: effect.id,
          optionKey: `${card.id}::${effect.id ?? ""}`,
          cardName: card.name,
          resource: fromResource,
          amount: fromAmount,
          food: toResource === "food" ? toAmount : 0,
          outputResource: toResource,
          outputAmount: toAmount,
          max: Math.floor(sourceAmount / fromAmount),
        },
      ];
    });
  });
  return [...majorOptions, ...cardOptions];
}

function firstBadgeEntry(goods: Partial<Record<string, number>>): [BadgeType | null, number] {
  const entry = Object.entries(goods).find((item): item is [BadgeType, number] => isBadgeType(item[0]) && (item[1] ?? 0) > 0);
  return entry ?? [null, 0];
}

function isBadgeType(value: string): value is BadgeType {
  return value in RESOURCE_ICONS;
}

function isAnimal(value: BadgeType): value is Animal {
  return value === "sheep" || value === "boar" || value === "cattle";
}

function isPlayerResource(value: BadgeType): value is keyof Player["resources"] {
  return value === "wood" || value === "clay" || value === "reed" || value === "stone" || value === "grain" || value === "vegetable" || value === "food";
}

function canCookAnimal(player: Player): boolean {
  return player.majorImprovements.some((id) => id.startsWith("fireplace") || id.startsWith("cooking-hearth"));
}

function cookValue(player: Player, animal: Animal): number {
  const hasHearth = player.majorImprovements.some((id) => id.startsWith("cooking-hearth"));
  if (animal === "cattle") return hasHearth ? 4 : 3;
  if (animal === "boar") return hasHearth ? 3 : 2;
  return 2;
}

function translateAnimalName(animal: Animal): string {
  if (animal === "boar") return "野猪";
  if (animal === "cattle") return "牛";
  return "羊";
}


function formatAnimalCounts(counts: Partial<Record<Animal, number>>): AnimalCookInput[] {
  return (["sheep", "boar", "cattle"] as const)
    .map((animal) => ({ animal, count: counts[animal] ?? 0 }))
    .filter((item) => item.count > 0);
}

function calculatePendingBirths(game: NonNullable<ReturnType<typeof useGameStore.getState>["game"]>, playerId: string, overflowOnly = false): AnimalCookInput[] {
  const source = overflowOnly ? game.harvestBreeding?.overflowByPlayerId[playerId] ?? {} : game.harvestBreeding?.birthsByPlayerId[playerId] ?? {};
  return formatAnimalCounts(source);
}

function translatePhase(phase: string): string {
  const phases: Record<string, string> = {
    WAITING: "等待玩家",
    SETUP: "初始化",
    CARD_DRAFT: "轮抽选牌",
    ROUND_PREPARE: "回合准备",
    WORK_PHASE: "工作阶段",
    RETURN_HOME: "工人回家",
    HARVEST: "收获阶段",
    NEXT_ROUND: "下一轮",
    GAME_END: "游戏结束",
  };
  return phases[phase] ?? phase;
}
