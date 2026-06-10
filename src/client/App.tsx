import { useEffect, useState } from "react";
import type { ActionInput, CellPosition, RoomListItem } from "../shared/types";
import { createRoom, endAction, joinRoom, leaveRoom, login, placeWorker, register, startGame, wireSocketToStore } from "./socket/clientSocket";
import { useGameStore } from "./store/gameStore";
import { Board } from "./ui/Board/Board";
import { Cards } from "./ui/Cards/Cards";
import { Farm } from "./ui/Farm/Farm";
import { Resources } from "./ui/Resources/Resources";

const emptyPlayers: NonNullable<ReturnType<typeof useGameStore.getState>["game"]>["players"] = [];

export function App() {
  const { connected, game, notice, roomId, rooms, username } = useGameStore();
  const [screen, setScreen] = useState<"main" | "lobby">("main");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [manualRoomId, setManualRoomId] = useState("");
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const [selectedActionSpaceId, setSelectedActionSpaceId] = useState("");
  const [selectedEffectTypes, setSelectedEffectTypes] = useState<string[]>([]);
  const [fieldCell, setFieldCell] = useState("");
  const [roomCells, setRoomCells] = useState("");
  const [stableCells, setStableCells] = useState("");
  const [pastureCells, setPastureCells] = useState("");
  const [majorImprovementId, setMajorImprovementId] = useState("");
  const [bakeImprovementId, setBakeImprovementId] = useState("");
  const [bakeGrain, setBakeGrain] = useState(0);

  useEffect(() => wireSocketToStore(), []);
  useEffect(() => {
    if (!game) {
      return;
    }
    if (!viewingPlayerId || !game.players.some((player) => player.id === viewingPlayerId)) {
      setViewingPlayerId(username ?? game.players[0]?.id ?? null);
    }
  }, [game, username, viewingPlayerId]);

  if (!username) {
    return (
      <AuthPage
        authMode={authMode}
        connected={connected}
        notice={notice}
        password={authPassword}
        username={authUsername}
        onModeChange={setAuthMode}
        onPasswordChange={setAuthPassword}
        onSubmit={() => {
          if (authMode === "login") {
            login(authUsername, authPassword);
          } else {
            register(authUsername, authPassword);
          }
        }}
        onUsernameChange={setAuthUsername}
      />
    );
  }

  if (!game) {
    if (screen === "main") {
      return (
        <MainMenuPage
          connected={connected}
          notice={notice}
          username={username}
          onOpenLobby={() => setScreen("lobby")}
        />
      );
    }

    return (
      <LobbyPage
        connected={connected}
        manualRoomId={manualRoomId}
        notice={notice}
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
      />
    );
  }

  const players = game.players ?? emptyPlayers;
  const currentPlayer = players.find((player) => player.id === game.currentPlayer) ?? players[0];
  const myPlayer = players.find((player) => player.id === username) ?? players[0];
  const viewingPlayer = players.find((player) => player.id === viewingPlayerId) ?? myPlayer;
  const currentWorker = currentPlayer?.workers.find((worker) => worker.location === "home" && worker.availableRound <= game.round);
  const selectedAction = game.actionSpaces.find((space) => space.id === selectedActionSpaceId);

  function submitAction() {
    if (!roomId || !currentPlayer || !currentWorker || !selectedActionSpaceId) {
      return;
    }

    const input: ActionInput = {
      selectedEffectTypes,
      fieldCell: parseCell(fieldCell),
      roomCells: parseCells(roomCells),
      stableCells: parseCells(stableCells),
      pastureCells: parseCells(pastureCells),
      majorImprovementId: majorImprovementId || undefined,
      bake: bakeImprovementId && bakeGrain > 0 ? { improvementId: bakeImprovementId, grain: bakeGrain } : undefined,
    };

    placeWorker(roomId, currentPlayer.id, currentWorker.id, selectedActionSpaceId, input);
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
          <span className={connected ? "pill ok" : "pill"}>[连] {connected ? "已连接" : "未连接"}</span>
          <span className="pill">[轮] 第 {game.round} 轮</span>
          <span className="pill">[段] {translatePhase(game.phase)}</span>
          <button
            className="secondary-button"
            onClick={() => {
              setScreen("lobby");
              if (roomId) {
                leaveRoom(roomId);
              }
            }}
          >
            退出房间
          </button>
        </div>
      </header>

      {notice || game.lastError ? <section className="notice">[提示] {notice ?? game.lastError}</section> : null}

      <section className="table-layout">
        <aside className="left-rail">
          <section className="panel player-rail">
            <h2>玩家农场</h2>
            <div className="avatar-list">
              {players.map((player, index) => (
                <button
                  key={player.id}
                  className={player.id === viewingPlayer?.id ? "avatar-card active" : "avatar-card"}
                  onClick={() => setViewingPlayerId(player.id)}
                >
                  <span className="avatar-icon">{index + 1}</span>
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
          <Farm player={viewingPlayer ?? null} isOwnFarm={Boolean(viewingPlayer && viewingPlayer.id === username)} />
          <Resources players={players} />
        </aside>

        <section className="center-table">
          <Board />
        </section>

        <aside className="right-rail">
          <section className="panel action-panel">
            <h2>[行] 行动面板</h2>
            <p className="muted">
              当前行动：{currentPlayer?.name ?? "无"}
              {currentPlayer?.id === username ? "（我）" : ""}
            </p>
            <label>
              行动格
              <select value={selectedActionSpaceId} onChange={(event) => setSelectedActionSpaceId(event.target.value)}>
                <option value="">选择行动格</option>
                {game.actionSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedAction ? (
              <div className="effect-list">
                {flattenEffectTypes(selectedAction.effects).map((effectType) => (
                  <label key={effectType} className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedEffectTypes.includes(effectType)}
                      onChange={(event) =>
                        setSelectedEffectTypes((current) =>
                          event.target.checked ? [...current, effectType] : current.filter((type) => type !== effectType),
                        )
                      }
                    />
                    {translateEffect(effectType)}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="form-grid">
              <input value={fieldCell} onChange={(event) => setFieldCell(event.target.value)} placeholder="田地坐标：行,列" />
              <input value={roomCells} onChange={(event) => setRoomCells(event.target.value)} placeholder="房间坐标：行,列;行,列" />
              <input value={stableCells} onChange={(event) => setStableCells(event.target.value)} placeholder="畜棚坐标：行,列;行,列" />
              <input value={pastureCells} onChange={(event) => setPastureCells(event.target.value)} placeholder="牧场坐标：行,列;行,列" />
              <select value={majorImprovementId} onChange={(event) => setMajorImprovementId(event.target.value)}>
                <option value="">主要发展卡</option>
                {game.majorImprovements
                  .filter((card) => !card.purchasedBy)
                  .map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
              </select>
              <select value={bakeImprovementId} onChange={(event) => setBakeImprovementId(event.target.value)}>
                <option value="">烤面包卡</option>
                {currentPlayer?.majorImprovements.map((id) => (
                  <option key={id} value={id}>
                    {game.majorImprovements.find((card) => card.id === id)?.name ?? id}
                  </option>
                ))}
              </select>
              <input type="number" min="0" value={bakeGrain} onChange={(event) => setBakeGrain(Number(event.target.value))} placeholder="烤谷物数" />
            </div>
            <button onClick={submitAction}>派遣工人</button>
            <button onClick={() => roomId && startGame(roomId)}>开始游戏</button>
            <button onClick={() => roomId && endAction(roomId)}>推进阶段</button>
          </section>
          <Cards />
        </aside>
      </section>
    </main>
  );
}

interface AuthPageProps {
  authMode: "login" | "register";
  connected: boolean;
  notice: string | null;
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
        {props.notice ? <p className="notice compact">[提示] {props.notice}</p> : null}
      </section>
    </main>
  );
}

interface MainMenuPageProps {
  connected: boolean;
  notice: string | null;
  username: string;
  onOpenLobby: () => void;
}

function MainMenuPage(props: MainMenuPageProps) {
  return (
    <main className="app-shell menu-shell">
      <header className="home-hero">
        <h1>农家乐轻量版</h1>
        <p>玩家：{props.username}</p>
        <span className={props.connected ? "pill ok" : "pill"}>[连] {props.connected ? "已连接" : "未连接"}</span>
      </header>
      {props.notice ? <section className="notice">[提示] {props.notice}</section> : null}
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
  notice: string | null;
  rooms: RoomListItem[];
  username: string;
  onBackToMain: () => void;
  onCreateRoom: () => void;
  onJoinManualRoom: () => void;
  onManualRoomIdChange: (roomId: string) => void;
  onJoinRoom: (room: RoomListItem) => void;
}

function LobbyPage(props: LobbyPageProps) {
  const visibleRooms = props.rooms.filter((room) => /^\d+$/.test(room.roomId));

  return (
    <main className="app-shell">
      <header className="home-hero">
        <div>
          <h1>游戏大厅</h1>
          <p>玩家：{props.username}</p>
        </div>
        <div className="status-line">
          <span className={props.connected ? "pill ok" : "pill"}>[连] {props.connected ? "已连接" : "未连接"}</span>
          <button className="secondary-button" onClick={props.onBackToMain}>
            返回主菜单
          </button>
        </div>
      </header>

      {props.notice ? <section className="notice">[提示] {props.notice}</section> : null}

      <section className="panel lobby-page">
        <div className="lobby-head">
          <div>
            <h2>当前房间</h2>
            <p className="muted">创建房间，或点击房间加入。</p>
          </div>
          <button onClick={props.onCreateRoom}>创建房间</button>
        </div>

        <div className="manual-join">
          <input value={props.manualRoomId} onChange={(event) => props.onManualRoomIdChange(event.target.value)} placeholder="输入房间编号" />
          <button onClick={props.onJoinManualRoom}>加入房间</button>
        </div>

        <div className="room-list">
          {visibleRooms.length === 0 ? (
            <p className="muted">当前没有房间。</p>
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

function parseCell(value: string): CellPosition | undefined {
  const [row, col] = value.split(",").map((part) => Number(part.trim()));
  return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : undefined;
}

function parseCells(value: string): CellPosition[] {
  return value
    .split(";")
    .map((item) => parseCell(item))
    .filter((item): item is CellPosition => Boolean(item));
}

function flattenEffectTypes(effects: Array<{ type: string; effects?: Array<{ type: string }> }>): string[] {
  return Array.from(new Set(effects.flatMap((effect) => (effect.effects ? effect.effects.map((child) => child.type) : [effect.type]))));
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

function translateEffect(effect: string): string {
  const effects: Record<string, string> = {
    takeAccumulated: "拿取积累资源",
    gainResource: "获得资源",
    gainAnimal: "获得动物",
    plowField: "翻耕田地",
    buildRooms: "建造房间",
    buildStables: "建造畜棚",
    buildFences: "建造围栏",
    sow: "播种",
    bakeBread: "烤面包",
    buyMajorImprovement: "购买主要发展卡",
    playOccupationPlaceholder: "职业卡（未来开放）",
    playMinorImprovementPlaceholder: "次要发展卡（未来开放）",
    takeStartingPlayer: "取得起始玩家标记",
    renovate: "翻修房屋",
    familyGrowth: "生孩子",
    gainMissingAnimal: "获得没有的动物",
    buildingSupplies: "建筑补给",
    farmingSupplies: "耕作补给",
    sideJob: "副业",
  };
  return effects[effect] ?? effect;
}
