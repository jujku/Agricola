import { useEffect, useRef, useState } from "react";
import type { RoomListItem } from "../shared/types";
import { createRoom, joinRoom, leaveRoom, login, logout, register, startGame, submitHarvestFeeding, wireSocketToStore } from "./socket/clientSocket";
import { useGameStore } from "./store/gameStore";
import { Board } from "./ui/Board/Board";
import { Cards } from "./ui/Cards/Cards";
import { Farm } from "./ui/Farm/Farm";
import { Resources } from "./ui/Resources/Resources";
import { getPlayerColor, getPlayerColorById } from "./ui/VisualSystem/playerColors";

const emptyPlayers: NonNullable<ReturnType<typeof useGameStore.getState>["game"]>["players"] = [];

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

  useEffect(() => wireSocketToStore(), []);
  useEffect(() => {
    if (!game) return;
    if (!viewingPlayerId || !game.players.some((player) => player.id === viewingPlayerId)) {
      setViewingPlayerId(username ?? game.players[0]?.id ?? null);
    }
  }, [game, username, viewingPlayerId]);

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
          onCreateRoom={() => createRoom(username)}
          onJoinManualRoom={() => joinRoom(manualRoomId.trim(), username)}
          onManualRoomIdChange={setManualRoomId}
          onJoinRoom={(room) => joinRoom(room.roomId, username)}
          onLogout={logout}
        />
        <NoticeOverlay message={notice} onDone={() => setNotice(null)} />
      </>
    );
  }

  const players = game.players ?? emptyPlayers;
  const myPlayer = players.find((player) => player.id === username) ?? players[0];
  const viewingPlayer = players.find((player) => player.id === viewingPlayerId) ?? myPlayer;
  const viewingPlayerColor = getPlayerColorById(players, viewingPlayer?.id);
  const harvestSubmitted = Boolean(username && game.harvestFeeding?.submittedPlayerIds.includes(username));

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
          {game.phase === "WAITING" ? <button onClick={() => roomId && startGame(roomId)}>开始游戏</button> : null}
          <button
            className="secondary-button"
            onClick={() => {
              setConfirmLeaveOpen(true);
            }}
          >
            退出房间
          </button>
        </div>
      </header>

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
                    {player.id === username ? "（我）" : ""}
                  </span>
                  <small>
                    {player.workers.length} 工人 / {player.resources.food} 食物
                  </small>
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
            <Resources player={viewingPlayer ?? null} />
          </section>
        </aside>

        <section className="center-table">
          <Board onSelfAction={() => setViewingPlayerId(username)} />
        </section>

        <aside className="right-rail">
          <Cards />
        </aside>
      </section>
      <NoticeOverlay message={notice ?? game.lastError} onDone={() => setNotice(null)} />
      <ConfirmOverlay
        open={confirmLeaveOpen}
        title="退出房间"
        message="确认退出房间吗？退出后将返回大厅。"
        onCancel={() => setConfirmLeaveOpen(false)}
        onConfirm={() => {
          setConfirmLeaveOpen(false);
          setScreen("lobby");
          if (roomId) leaveRoom(roomId);
        }}
      />
      <HarvestFeedingOverlay
        grainToFood={grainToFood}
        onGrainToFoodChange={setGrainToFood}
        onSubmit={() => {
          if (!roomId || !username) return;
          submitHarvestFeeding(roomId, username, grainToFood, vegetableToFood);
        }}
        onVegetableToFoodChange={setVegetableToFood}
        open={game.phase === "HARVEST"}
        player={myPlayer ?? null}
        players={players}
        submittedPlayerIds={game.harvestFeeding?.submittedPlayerIds ?? []}
        submitted={harvestSubmitted}
        vegetableToFood={vegetableToFood}
      />
    </main>
  );
}

interface AuthPageProps {
  authMode: "login" | "register";
  connected: boolean;
  password: string;
  username: string;
  onModeChange: (mode: "login" | "register") => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onUsernameChange: (username: string) => void;
}

function AuthPage(props: AuthPageProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>农场主</h1>
        <p className="muted">登录账号后进入游戏。</p>
        <div className="segmented">
          <button className={props.authMode === "login" ? "active" : ""} onClick={() => props.onModeChange("login")}>
            登录
          </button>
          <button className={props.authMode === "register" ? "active" : ""} onClick={() => props.onModeChange("register")}>
            注册
          </button>
        </div>
        <input value={props.username} onChange={(event) => props.onUsernameChange(event.target.value)} placeholder="用户名" />
        <input type="password" value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="密码" />
        <button onClick={props.onSubmit}>{props.authMode === "login" ? "登录" : "注册并登录"}</button>
        <p className="muted">连接状态：{props.connected ? "已连接" : "未连接"}</p>
      </section>
    </main>
  );
}

interface MainMenuPageProps {
  connected: boolean;
  username: string;
  onLogout: () => void;
  onOpenLobby: () => void;
}

function MainMenuPage(props: MainMenuPageProps) {
  return (
    <main className="app-shell menu-shell">
      <header className="home-hero">
        <h1>农家乐轻量版</h1>
        <div className="account-line">
          <p>账号：{props.username}</p>
          <button className="secondary-button" onClick={props.onLogout}>
            登出账号
          </button>
        </div>
        <span className={props.connected ? "pill ok" : "pill"}>连接：{props.connected ? "已连接" : "未连接"}</span>
      </header>
      <section className="panel main-menu">
        <h2>主菜单</h2>
        <button onClick={props.onOpenLobby}>进入游戏大厅</button>
      </section>
    </main>
  );
}

interface LobbyPageProps {
  connected: boolean;
  manualRoomId: string;
  rooms: RoomListItem[];
  username: string;
  onBackToMain: () => void;
  onCreateRoom: () => void;
  onJoinManualRoom: () => void;
  onManualRoomIdChange: (roomId: string) => void;
  onJoinRoom: (room: RoomListItem) => void;
  onLogout: () => void;
}

function LobbyPage(props: LobbyPageProps) {
  const visibleRooms = props.rooms.filter((room) => /^\d+$/.test(room.roomId) && room.phase === "WAITING");

  return (
    <main className="app-shell">
      <header className="home-hero">
        <div>
          <h1>游戏大厅</h1>
          <p>玩家：{props.username}</p>
        </div>
        <div className="status-line">
          <span className={props.connected ? "pill ok" : "pill"}>连接：{props.connected ? "已连接" : "未连接"}</span>
          <button className="secondary-button" onClick={props.onBackToMain}>
            返回主菜单
          </button>
          <button className="secondary-button" onClick={props.onLogout}>
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
          <button onClick={props.onCreateRoom}>创建房间</button>
        </div>

        <div className="manual-join">
          <input value={props.manualRoomId} onChange={(event) => props.onManualRoomIdChange(event.target.value)} placeholder="输入房间编号" />
          <button onClick={props.onJoinManualRoom}>加入房间</button>
        </div>

        <div className="room-list">
          {visibleRooms.length === 0 ? (
            <p className="muted">当前没有可加入房间。</p>
          ) : (
            visibleRooms.map((room) => (
              <button key={room.roomId} className="room-card" onClick={() => props.onJoinRoom(room)}>
                <span className="room-number">#{room.roomId}</span>
                <span>{translatePhase(room.phase)}</span>
                <small>
                  {room.players.length} 人 / 第 {room.round} 轮
                </small>
                <strong>点击加入</strong>
              </button>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function translatePhase(phase: string): string {
  const phases: Record<string, string> = {
    WAITING: "等待玩家",
    SETUP: "初始化",
    ROUND_PREPARE: "回合准备",
    WORK_PHASE: "工作阶段",
    RETURN_HOME: "工人回家",
    HARVEST: "收获阶段",
    NEXT_ROUND: "下一轮",
    GAME_END: "游戏结束",
  };
  return phases[phase] ?? phase;
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

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    setDisplayMessage(message);
    timerRef.current = window.setTimeout(() => {
      setDisplayMessage(null);
      onDoneRef.current?.();
      timerRef.current = null;
    }, 1400);
  }, [message]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  if (!displayMessage) {
    return null;
  }

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
  if (!open) {
    return null;
  }

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
          <button onClick={onConfirm}>确认退出</button>
        </footer>
      </section>
    </div>
  );
}

function HarvestFeedingOverlay({
  grainToFood,
  onGrainToFoodChange,
  onSubmit,
  onVegetableToFoodChange,
  open,
  player,
  players,
  submitted,
  submittedPlayerIds,
  vegetableToFood,
}: {
  grainToFood: number;
  onGrainToFoodChange: (value: number) => void;
  onSubmit: () => void;
  onVegetableToFoodChange: (value: number) => void;
  open: boolean;
  player: (typeof emptyPlayers)[number] | null;
  players: typeof emptyPlayers;
  submitted: boolean;
  submittedPlayerIds: string[];
  vegetableToFood: number;
}) {
  useEffect(() => {
    if (!open || !player || submitted) return;
    onGrainToFoodChange(clampNumber(grainToFood, 0, player.resources.grain));
    onVegetableToFoodChange(clampNumber(vegetableToFood, 0, player.resources.vegetable));
  }, [open, player?.id, player?.resources.grain, player?.resources.vegetable, submitted]);

  if (!open || !player) {
    return null;
  }

  const normalizedGrain = clampNumber(grainToFood, 0, player.resources.grain);
  const normalizedVegetable = clampNumber(vegetableToFood, 0, player.resources.vegetable);
  const foodAfterConversion = player.resources.food + normalizedGrain + normalizedVegetable;
  const requiredFood = player.workers.length * 2;
  const beggingCards = Math.max(0, requiredFood - foodAfterConversion);
  const paidFood = Math.min(foodAfterConversion, requiredFood);

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="harvest-feeding-title">
      <section className="game-modal harvest-modal">
        <span className="game-modal__eyebrow">收获阶段</span>
        <h2 id="harvest-feeding-title">家庭喂食</h2>
        <p>选择是否把资源区的谷物和蔬菜转化为食物。</p>

        <div className="harvest-controls">
          <HarvestConvertControl
            label="谷物转食物"
            max={player.resources.grain}
            onChange={onGrainToFoodChange}
            value={normalizedGrain}
            disabled={submitted}
          />
          <HarvestConvertControl
            label="蔬菜转食物"
            max={player.resources.vegetable}
            onChange={onVegetableToFoodChange}
            value={normalizedVegetable}
            disabled={submitted}
          />
        </div>

        <div className="harvest-summary">
          <span>当前食物 {player.resources.food}</span>
          <span>转换后 {foodAfterConversion}</span>
          <span>需要 {requiredFood}</span>
          <span>将消耗 {paidFood}</span>
          <strong>预计乞讨卡 {beggingCards}</strong>
        </div>

        <div className="harvest-progress">
          {players.map((candidate, index) => (
            <span
              key={candidate.id}
              className={submittedPlayerIds.includes(candidate.id) ? "harvest-progress__player done" : "harvest-progress__player"}
              style={{ ["--player-color" as string]: getPlayerColor(index) }}
            >
              {candidate.name}
            </span>
          ))}
        </div>

        {submitted ? (
          <strong className="harvest-waiting">已确认，等待其他玩家。</strong>
        ) : (
          <button onClick={onSubmit}>确认喂食</button>
        )}
      </section>
    </div>
  );
}

function HarvestConvertControl({
  disabled,
  label,
  max,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  max: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="harvest-control">
      <span>
        {label}
        <small>最多 {max}</small>
      </span>
      <input disabled={disabled} max={max} min="0" type="number" value={value} onChange={(event) => onChange(clampNumber(Number(event.target.value), 0, max))} />
    </label>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
