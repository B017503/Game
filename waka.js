(function () {

    // ============================================================
    //  CONSTANTS & STATE
    // ============================================================

    const W = 540, H = 340;
    const CELL = 17;
    const COLS = Math.floor(W / CELL);
    const ROWS = Math.floor(H / CELL);
    const TICK = 120;

    const INITIAL_BASE_SPEED = 3;
    const COLORS = { host: '#ff5f1f', joiner: '#3b82f6' };
    const POWERUP_TYPES = ['speed', 'shrink'];

    let pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    let dc = null;
    let isHost = false;
    let userName = "User_" + Math.floor(Math.random() * 99);
    let peerName = null;
    let unreadCount = 0;
    let currentGame = null;

    // Pong state
    let pongState = {
        ball: { x: 270, y: 170, dx: 0, dy: 0 },
        pL: 170, pR: 170,
        scoreL: 0, scoreR: 0,
        countdown: 0,
        isRoundActive: false,
        baseSpeed: INITIAL_BASE_SPEED,
        speedInterval: null,
        animFrame: null,
    };

    // Snake state
    let snakeState = {
        snakes: {},
        food: [],
        powerUps: [],
        animFrame: null,
        tickTimer: null,
        winner: null,
        started: false,
        roundCountdown: null,
        roundCountdownEnd: null,
    };

    // Tic Tac Toe state
    let tttState = {
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        winLine: null,
        restartCountdown: null,
        scores: { X: 0, O: 0 },
    };
    let tttRestartTimer = null;
    let tttAnimFrame = null;
    let tttWinProgress = 0;

    // ============================================================
    //  CONNECT 4 STATE
    // ============================================================

    const C4_ROWS = 6;
    const C4_COLS = 7;
    const C4_CELL = 46;
    const C4_R = 17;
    const C4_BOARD_X = (W - C4_COLS * C4_CELL) / 2;
    const C4_BOARD_Y = (H - C4_ROWS * C4_CELL) / 2 + 4;

    let c4State = {
        board: Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null)),
        turn: 'R',
        winner: null,
        winCells: null,
        restartCountdown: null,
        scores: { R: 0, Y: 0 },
    };
    let c4RestartTimer = null;
    let c4AnimFrame = null;
    let c4HoverCol = -1;
    let c4WinProgress = 0;

    // ============================================================
    //  ROCK PAPER SCISSORS STATE
    // ============================================================

    let rpsState = {
        myChoice: null,
        theirChoice: null,
        phase: 'choose',
        scores: { host: 0, joiner: 0 },
        round: 1,
        roundWinner: null,
        seriesWinner: null,
        countdown: 0,
        animFrame: null,
        restartTimer: null,
        hostChoice: null,
        joinerChoice: null,
        hostReady: false,
        joinerReady: false,
    };

    // ============================================================
    //  MEMORY (SIMON) STATE
    // ============================================================

    const MEM_COLORS = ['#ff3b30', '#30d158', '#0a84ff', '#ffd60a'];
    const MEM_DARK = ['#4a0a07', '#0a2e10', '#021a3a', '#3a2e00'];
    const MEM_GLOW = ['rgba(255,59,48,0.55)', 'rgba(48,209,88,0.55)', 'rgba(10,132,255,0.55)', 'rgba(255,214,10,0.55)'];
    const MEM_LABELS = ['RED', 'GREEN', 'BLUE', 'YELLOW'];
    const MEM_SHOW_MS = 550;   // how long each tile lights up
    const MEM_GAP_MS = 160;   // gap between tiles during show
    const MEM_WIN_SCORE = 5;

    // Simon-style arc quadrant layout
    const MEM_CENTER_X = W / 2;
    const MEM_CENTER_Y = H / 2 + 14;
    const MEM_OUTER_R = 112;
    const MEM_INNER_R = 36;
    const MEM_GAP_ANG = 0.055;

    // Quadrant order: 0=red(TL), 1=green(TR), 2=blue(BL), 3=yellow(BR)
    const MEM_QUADS = [
        { idx: 0, startAng: Math.PI, endAng: Math.PI * 1.5 },
        { idx: 1, startAng: Math.PI * 1.5, endAng: Math.PI * 2 },
        { idx: 2, startAng: Math.PI * 0.5, endAng: Math.PI },
        { idx: 3, startAng: 0, endAng: Math.PI * 0.5 },
    ];

    // Hit-test: is point (px,py) inside quadrant arc?
    const memQuadHit = (q, px, py) => {
        const dx = px - MEM_CENTER_X, dy = py - MEM_CENTER_Y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MEM_INNER_R || dist > MEM_OUTER_R) return false;
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI * 2;
        let s = q.startAng + MEM_GAP_ANG, e = q.endAng - MEM_GAP_ANG;
        if (s > e) { s -= Math.PI * 2; if (ang > Math.PI) ang -= Math.PI * 2; }
        return ang >= s && ang <= e;
    };

    const memInitState = (keepScores) => ({
        sequence: [],
        phase: 'waiting',           // waiting | showing | input | correct | wrong | roundover | gameover
        activePlayer: 'host',       // whose turn to input
        inputIndex: 0,
        litIdx: -1,                 // which button is currently lit during 'showing'
        showStep: 0,                // which step in sequence we're showing
        scores: keepScores || { host: 0, joiner: 0 },
        winner: null,
        restartCountdown: null,
        flashColor: null,           // 'good' | 'bad' — for feedback flash
        flashTimer: 0,
        message: 'PRESS START',
    });

    let memState = null; // initialised below after memInitState is defined
    let memAnimFrame = null;
    let memShowTimer = null;
    let memRestartTimer = null;
    let memHoverBtn = -1;

    const isConnected = () => dc && dc.readyState === "open";

    // ============================================================
    //  UI SHELL
    // ============================================================

    const ui = document.createElement('div');
    ui.id = "eclipse-ui";
    ui.style.cssText = "position:fixed; top:50px; left:50px; width:600px; height:400px; background:#0a0a0c; color:#e2e8f0; z-index:10000; font-family:'Segoe UI', system-ui; display:flex; border-radius:12px; border:1px solid #1f1f23; box-shadow:0 20px 50px rgba(0,0,0,0.7); overflow:hidden;";

    const side = document.createElement('div');
    side.style.cssText = "width:60px; background:#111114; display:flex; flex-direction:column; align-items:center; padding:20px 0; border-right:1px solid #1f1f23; gap:25px;";

    const dot = document.createElement('div');
    dot.style.cssText = "width:10px; height:10px; border-radius:50%; background:#3f3f46; transition:0.3s;";
    side.appendChild(dot);

    const createIcon = (txt) => {
        const i = document.createElement('div');
        i.textContent = txt;
        i.style.cssText = "cursor:pointer; font-size:18px; opacity:0.4; transition:0.2s; user-select:none;";
        i.onmouseover = () => i.style.opacity = "1";
        i.onmouseout = () => { if (i.getAttribute('active') !== 'true') i.style.opacity = "0.4"; };
        return i;
    };

    const iG = createIcon("🎮");
    const chatWrapper = document.createElement('div');
    chatWrapper.style.position = "relative";
    const iC = createIcon("💬");
    const badge = document.createElement('div');
    badge.style.cssText = "position:absolute; top:-5px; right:-8px; background:#ff3b30; color:white; font-size:9px; font-weight:bold; padding:2px 5px; border-radius:10px; display:none; pointer-events:none; border:2px solid #111114;";
    chatWrapper.append(iC, badge);
    const iS = createIcon("⚙️");
    side.append(iG, chatWrapper, iS);

    const main = document.createElement('div');
    main.style.cssText = "flex:1; display:flex; flex-direction:column; position:relative; overflow:hidden;";

    const header = document.createElement('div');
    header.style.cssText = "padding:15px 25px; display:flex; justify-content:space-between; align-items:center; cursor:move; background:rgba(255,255,255,0.02); flex-shrink:0;";
    const hTitle = document.createElement('span');
    hTitle.textContent = "OS";
    hTitle.style.cssText = "font-size:10px; font-weight:800; letter-spacing:2px; color:#52525b;";

    const leaveBtn = document.createElement('div');
    leaveBtn.style.cssText = "display:none; align-items:center; gap:6px; cursor:pointer; padding:5px 10px; border-radius:6px; border:1px solid #3f1f1f; background:#1a0a0a;";
    const leaveText = document.createElement('span');
    leaveText.style.cssText = "font-size:11px; color:#ff3b30; font-weight:bold; letter-spacing:1px;";
    leaveText.textContent = "LEAVE";
    const leaveDoor = document.createElement('span');
    leaveDoor.style.cssText = "font-size:13px;";
    leaveDoor.textContent = "🚪";
    leaveBtn.append(leaveText, leaveDoor);
    leaveBtn.onmouseover = () => leaveBtn.style.background = "#2a0a0a";
    leaveBtn.onmouseout = () => leaveBtn.style.background = "#1a0a0a";
    leaveBtn.onclick = () => {
        if (isConnected()) { try { dc.send("GLEAVE"); } catch (e) { } }
        if (currentGame === 'pong') stopPong();
        if (currentGame === 'snake') stopSnake();
        if (currentGame === 'ttt') stopTTT();
        if (currentGame === 'c4') stopC4();
        if (currentGame === 'rps') stopRPS();
        if (currentGame === 'memory') stopMemory();
        setTab(gameV, iG);
    };

    header.append(hTitle, leaveBtn);

    // ============================================================
    //  VIEWS
    // ============================================================

    const pongC = document.createElement('canvas');
    pongC.width = W; pongC.height = H;
    pongC.style.cssText = "display:none; background:#000;";
    const pctx = pongC.getContext('2d');

    const snakeC = document.createElement('canvas');
    snakeC.width = W; snakeC.height = H;
    snakeC.style.cssText = "display:none; background:#000;";
    const sctx = snakeC.getContext('2d');

    const tttC = document.createElement('canvas');
    tttC.width = W; tttC.height = H;
    tttC.style.cssText = "display:none; background:#000; cursor:pointer;";
    const tctx = tttC.getContext('2d');

    const c4C = document.createElement('canvas');
    c4C.width = W; c4C.height = H;
    c4C.style.cssText = "display:none; background:#000; cursor:pointer;";
    const c4ctx = c4C.getContext('2d');

    const rpsC = document.createElement('canvas');
    rpsC.width = W; rpsC.height = H;
    rpsC.style.cssText = "display:none; background:#000; cursor:pointer;";
    const rctx = rpsC.getContext('2d');

    // Memory canvas
    const memC = document.createElement('canvas');
    memC.width = W; memC.height = H;
    memC.style.cssText = "display:none; background:#000; cursor:pointer;";
    const mctx = memC.getContext('2d');

    const chatV = document.createElement('div');
    chatV.style.cssText = "position:absolute; inset:40px 0 0 0; display:none; flex-direction:column; padding:15px; overflow:hidden; background:rgba(10,10,12,0.92); backdrop-filter:blur(4px); z-index:5;";
    const mB = document.createElement('div');
    mB.style.cssText = "flex:1; overflow-y:auto; margin-bottom:10px; display:flex; flex-direction:column; gap:8px; padding-right:5px;";
    const inp = document.createElement('input');
    inp.placeholder = "Message...";
    inp.style.cssText = "background:#18181b; border:1px solid #27272a; color:#fff; padding:10px 15px; border-radius:20px; outline:none; flex-shrink:0;";
    chatV.append(mB, inp);

    const lockedV = document.createElement('div');
    lockedV.style.cssText = "flex:1; display:none; flex-direction:column; align-items:center; justify-content:center; gap:12px; padding:40px;";
    const lockIcon = document.createElement('div');
    lockIcon.style.cssText = "width:36px; height:36px; border-radius:50%; border:2px solid #27272a; display:flex; align-items:center; justify-content:center; font-size:16px;";
    lockIcon.textContent = "🔒";
    const lockTitle = document.createElement('div');
    lockTitle.textContent = "NOT CONNECTED";
    lockTitle.style.cssText = "font-size:14px; font-weight:bold; color:#a1a1aa; letter-spacing:1px;";
    const lockSub = document.createElement('div');
    lockSub.textContent = "You need to establish a peer connection before you can access this.";
    lockSub.style.cssText = "font-size:12px; color:#52525b; text-align:center; line-height:1.6;";
    const lockBtn = document.createElement('button');
    lockBtn.textContent = "GO TO SETTINGS";
    lockBtn.style.cssText = "margin-top:8px; padding:10px 20px; border-radius:8px; border:1px solid #27272a; background:transparent; color:#a1a1aa; font-size:11px; font-weight:bold; cursor:pointer; letter-spacing:1px;";
    lockBtn.onmouseover = () => lockBtn.style.background = "#1f1f23";
    lockBtn.onmouseout = () => lockBtn.style.background = "transparent";
    lockBtn.onclick = () => setTab(setV, iS);
    lockedV.append(lockIcon, lockTitle, lockSub, lockBtn);

    const gameV = document.createElement('div');
    gameV.style.cssText = "flex:1; display:none; flex-direction:column; padding:30px; overflow:hidden;";
    const gameVTitle = document.createElement('div');
    gameVTitle.textContent = "GAMES";
    gameVTitle.style.cssText = "font-size:9px; font-weight:800; letter-spacing:2px; color:#52525b; margin-bottom:20px;";

    const gamesGrid = document.createElement('div');
    gamesGrid.style.cssText = "display:flex; gap:16px; flex-wrap:wrap;";

    const makeTile = (emoji, label) => {
        const tile = document.createElement('div');
        tile.style.cssText = "width:90px; display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer;";
        const icon = document.createElement('div');
        icon.style.cssText = "width:70px; height:70px; border-radius:14px; background:#111114; border:1px solid #27272a; display:flex; align-items:center; justify-content:center; font-size:28px; transition:0.2s;";
        icon.textContent = emoji;
        const lbl = document.createElement('div');
        lbl.textContent = label;
        lbl.style.cssText = "font-size:11px; color:#a1a1aa; text-align:center;";
        tile.append(icon, lbl);
        tile.onmouseover = () => { icon.style.border = "1px solid #ff5f1f"; icon.style.background = "#1a1008"; };
        tile.onmouseout = () => { icon.style.border = "1px solid #27272a"; icon.style.background = "#111114"; };
        return { tile, icon };
    };

    const { tile: pongTile } = makeTile("🏓", "Ping Pong");
    const { tile: snakeTile } = makeTile("🐍", "Snake");
    const { tile: tttTile } = makeTile("✖️", "Tic Tac Toe");
    const { tile: c4Tile } = makeTile("🔴", "Connect 4");
    const { tile: rpsTile } = makeTile("✊", "RPS");
    const { tile: memTile } = makeTile("🧠", "Memory");
    gamesGrid.append(pongTile, snakeTile, tttTile, c4Tile, rpsTile, memTile);
    gameV.append(gameVTitle, gamesGrid);

    const waitV = document.createElement('div');
    waitV.style.cssText = "flex:1; display:none; flex-direction:column; align-items:center; justify-content:center; gap:16px; padding:40px;";
    const waitSpinner = document.createElement('div');
    waitSpinner.style.cssText = "width:32px; height:32px; border-radius:50%; border:3px solid #27272a; border-top-color:#ff5f1f; animation:spin 0.8s linear infinite;";
    const spinStyle = document.createElement('style');
    spinStyle.textContent = "@keyframes spin { to { transform: rotate(360deg); } } @keyframes slideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }";
    document.head.appendChild(spinStyle);
    const waitTitle = document.createElement('div');
    waitTitle.style.cssText = "font-size:14px; font-weight:bold; color:#a1a1aa; letter-spacing:1px;";
    waitTitle.textContent = "WAITING FOR RESPONSE...";
    const waitSub = document.createElement('div');
    waitSub.style.cssText = "font-size:12px; color:#52525b;";
    const waitCancel = document.createElement('button');
    waitCancel.textContent = "CANCEL";
    waitCancel.style.cssText = "margin-top:8px; padding:10px 20px; border-radius:8px; border:1px solid #27272a; background:transparent; color:#a1a1aa; font-size:11px; font-weight:bold; cursor:pointer; letter-spacing:1px;";
    waitCancel.onmouseover = () => waitCancel.style.background = "#1f1f23";
    waitCancel.onmouseout = () => waitCancel.style.background = "transparent";
    waitCancel.onclick = () => {
        if (isConnected()) { try { dc.send("GINVITE_CANCEL"); } catch (e) { } }
        setTab(gameV, iG);
    };
    waitV.append(waitSpinner, waitTitle, waitSub, waitCancel);

    const setV = document.createElement('div');
    setV.style.cssText = "flex:1; display:flex; flex-direction:column; padding:40px; gap:20px;";
    const preConn = document.createElement('div');
    preConn.style.cssText = "display:flex; flex-direction:column; gap:20px;";
    const nameInp = document.createElement('input');
    nameInp.placeholder = "Set Display Name";
    nameInp.style.cssText = "background:transparent; border:none; border-bottom:1px solid #27272a; color:#ff5f1f; font-size:24px; outline:none;";
    const btnRow = document.createElement('div');
    btnRow.style.cssText = "display:flex; gap:10px;";
    const bStyle = "flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; cursor:pointer; font-size:11px;";
    const bO = document.createElement('button'); bO.textContent = "HOST SESSION";
    bO.style.cssText = bStyle + "background:#ff5f1f; color:#fff;";
    const bJ = document.createElement('button'); bJ.textContent = "JOIN PEER";
    bJ.style.cssText = bStyle + "background:#1f1f23; color:#a1a1aa;";
    const statusBox = document.createElement('div');
    statusBox.style.cssText = "font-size:11px; color:#52525b;";
    statusBox.textContent = "AWAITING CONFIGURATION...";
    btnRow.append(bO, bJ);
    preConn.append(nameInp, btnRow, statusBox);

    const postConn = document.createElement('div');
    postConn.style.cssText = "display:none; flex-direction:column; gap:20px;";
    const connCard = document.createElement('div');
    connCard.style.cssText = "background:#111114; border:1px solid #27272a; border-radius:10px; padding:20px 24px; display:flex; align-items:center; gap:16px;";
    const connDot2 = document.createElement('div');
    connDot2.style.cssText = "width:10px; height:10px; border-radius:50%; background:#ff5f1f; flex-shrink:0;";
    const connInfo = document.createElement('div');
    connInfo.style.cssText = "display:flex; flex-direction:column; gap:4px;";
    const connLabel = document.createElement('div');
    connLabel.textContent = "CONNECTED TO";
    connLabel.style.cssText = "font-size:9px; font-weight:800; letter-spacing:2px; color:#52525b;";
    const connName = document.createElement('div');
    connName.style.cssText = "font-size:18px; font-weight:bold; color:#ff5f1f;";
    connInfo.append(connLabel, connName);
    connCard.append(connDot2, connInfo);
    const bDisc = document.createElement('button');
    bDisc.textContent = "DISCONNECT";
    bDisc.style.cssText = "padding:15px; border-radius:8px; border:1px solid #3f1f1f; background:#1a0a0a; color:#ff3b30; font-weight:bold; cursor:pointer; font-size:11px; letter-spacing:1px;";
    bDisc.onmouseover = () => bDisc.style.background = "#2a0a0a";
    bDisc.onmouseout = () => bDisc.style.background = "#1a0a0a";
    postConn.append(connCard, bDisc);
    setV.append(preConn, postConn);

    main.append(header, pongC, snakeC, tttC, c4C, rpsC, memC, chatV, lockedV, gameV, waitV, setV);
    ui.append(side, main);
    document.body.appendChild(ui);

    // ============================================================
    //  TOASTS
    // ============================================================

    let toastTimeout = null;

    const showToast = (senderName, gameName, onAccept, onDecline) => {
        if (ui.style.display === "none") { onDecline(); return; }
        const existing = document.getElementById('eclipse-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = "eclipse-toast";
        toast.style.cssText = "position:fixed; bottom:30px; right:30px; background:#111114; border:1px solid #27272a; border-radius:12px; padding:16px 20px; z-index:10001; display:flex; flex-direction:column; gap:10px; width:280px; box-shadow:0 10px 30px rgba(0,0,0,0.8); animation:slideIn 0.2s ease;";
        const toastTop = document.createElement('div');
        toastTop.style.cssText = "display:flex; align-items:center; gap:10px;";
        const toastDot = document.createElement('div');
        toastDot.style.cssText = "width:8px; height:8px; border-radius:50%; background:#ff5f1f; flex-shrink:0;";
        const toastText = document.createElement('div');
        toastText.style.cssText = "font-size:12px; color:#e2e8f0; line-height:1.5;";
        const span1 = document.createElement('span');
        span1.style.cssText = "color:#ff5f1f; font-weight:bold;";
        span1.textContent = senderName;
        const span2 = document.createElement('span');
        span2.style.cssText = "color:#ff5f1f; font-weight:bold;";
        span2.textContent = gameName;
        toastText.append(span1, " wants to play ", span2);
        toastTop.append(toastDot, toastText);
        const toastBtns = document.createElement('div');
        toastBtns.style.cssText = "display:flex; gap:8px;";
        const acceptBtn = document.createElement('button');
        acceptBtn.textContent = "ACCEPT";
        acceptBtn.style.cssText = "flex:1; padding:8px; border-radius:6px; border:none; background:#ff5f1f; color:#000; font-weight:bold; cursor:pointer; font-size:10px; letter-spacing:1px;";
        const declineBtn = document.createElement('button');
        declineBtn.textContent = "DECLINE";
        declineBtn.style.cssText = "flex:1; padding:8px; border-radius:6px; border:1px solid #27272a; background:transparent; color:#a1a1aa; font-weight:bold; cursor:pointer; font-size:10px; letter-spacing:1px;";
        toastBtns.append(acceptBtn, declineBtn);
        toast.append(toastTop, toastBtns);
        document.body.appendChild(toast);
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => { toast.remove(); onDecline(); }, 15000);
        acceptBtn.onclick = () => { clearTimeout(toastTimeout); toast.remove(); onAccept(); };
        declineBtn.onclick = () => { clearTimeout(toastTimeout); toast.remove(); onDecline(); };
    };

    const hideToast = () => {
        const t = document.getElementById('eclipse-toast');
        if (t) t.remove();
        if (toastTimeout) clearTimeout(toastTimeout);
    };

    const showInfo = (msg) => {
        if (ui.style.display === "none") return;
        const existing = document.getElementById('eclipse-info');
        if (existing) existing.remove();
        const info = document.createElement('div');
        info.id = "eclipse-info";
        info.style.cssText = "position:fixed; bottom:30px; right:30px; background:#111114; border:1px solid #27272a; border-radius:10px; padding:14px 18px; z-index:10001; font-size:12px; color:#a1a1aa; box-shadow:0 10px 30px rgba(0,0,0,0.8); animation:slideIn 0.2s ease;";
        info.textContent = msg;
        document.body.appendChild(info);
        setTimeout(() => info.remove(), 3000);
    };

    // ============================================================
    //  TAB SWITCHING
    // ============================================================

    const allViews = () => [pongC, snakeC, tttC, c4C, rpsC, memC, chatV, lockedV, gameV, waitV, setV];
    const allIcons = () => [iG, iC, iS];

    const setTab = (view, icon) => {
        if ((view === pongC || view === snakeC || view === tttC || view === c4C || view === rpsC || view === memC || view === chatV || view === gameV || view === waitV) && !isConnected()) {
            allViews().forEach(v => v.style.display = "none");
            allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
            lockedV.style.display = "flex";
            leaveBtn.style.display = "none";
            if (icon) { icon.style.opacity = "1"; icon.setAttribute('active', 'true'); }
            return;
        }
        allViews().forEach(v => v.style.display = "none");
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        const isCanvas = view === pongC || view === snakeC || view === tttC || view === c4C || view === rpsC || view === memC;
        view.style.display = isCanvas ? "block" : "flex";
        if (icon) { icon.style.opacity = "1"; icon.setAttribute('active', 'true'); }
        if (view === chatV) { unreadCount = 0; badge.style.display = "none"; }
        leaveBtn.style.display = isCanvas ? "flex" : "none";
        if (view === setV) { isConnected() ? showPostConn() : showPreConn(); }
        leaveBtn.style.display = isCanvas ? "flex" : "none";
    };

    const showPreConn = () => { preConn.style.display = "flex"; postConn.style.display = "none"; };
    const showPostConn = () => { preConn.style.display = "none"; postConn.style.display = "flex"; connName.textContent = peerName || "Unknown"; };

    // ============================================================
    //  FULL DISCONNECT RESET
    // ============================================================

    const resetAll = () => {
        stopPong();
        stopSnake();
        stopTTT();
        stopC4();
        stopRPS();
        stopMemory();
        peerName = null;
        dot.style.background = "#3f3f46"; dot.style.boxShadow = "none";
        unreadCount = 0; badge.style.display = "none"; while (mB.firstChild) mB.removeChild(mB.firstChild);
        hideToast();
        if (dc) { try { dc.close(); } catch (e) { } dc = null; }
        try { pc.close(); } catch (e) { }
        pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pc.ondatachannel = (e) => setupDC(e.channel);
        isHost = false;
        const existing = setV.querySelector('.paste-btn');
        if (existing) existing.remove();
        showPreConn();
        statusBox.textContent = "AWAITING CONFIGURATION...";
        setTab(setV, iS);
    };

    bDisc.onclick = () => {
        if (isConnected()) { try { dc.send("D"); } catch (e) { } }
        resetAll();
    };

    // ============================================================
    //  CHAT
    // ============================================================

    const log = (msg, name, isMe) => {
        if (!isMe && chatV.style.display === "none") {
            unreadCount++;
            badge.textContent = unreadCount > 9 ? "9+" : unreadCount;
            badge.style.display = "block";
        }
        const container = document.createElement('div');
        container.style.cssText = `display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; width:100%;`;
        const nameLabel = document.createElement('small');
        nameLabel.textContent = name;
        nameLabel.style.cssText = "color:#52525b; font-size:10px; margin-bottom:2px; margin-inline:5px;";
        const bubble = document.createElement('div');
        bubble.textContent = msg;
        bubble.style.cssText = `background:${isMe ? '#ff5f1f' : '#1f1f23'}; color:${isMe ? '#000' : '#fff'}; padding:8px 12px; border-radius:12px; max-width:80%; font-size:13px; word-break:break-word;`;
        container.append(nameLabel, bubble);
        mB.appendChild(container);
        mB.scrollTop = mB.scrollHeight;
    };

    inp.onkeydown = (e) => {
        if (e.key === "Enter" && inp.value.trim() !== "") {
            if (isConnected()) dc.send("C" + JSON.stringify({ n: userName, m: inp.value }));
            log(inp.value, userName, true);
            inp.value = "";
        }
    };

    // ============================================================
    //  PONG
    // ============================================================

    const stopPong = () => {
        if (pongState.animFrame) { cancelAnimationFrame(pongState.animFrame); pongState.animFrame = null; }
        if (pongState.speedInterval) { clearInterval(pongState.speedInterval); pongState.speedInterval = null; }
        pongState.isRoundActive = false; pongState.countdown = 0;
        pongState.ball = { x: 270, y: 170, dx: 0, dy: 0 };
        pongState.pL = 170; pongState.pR = 170;
        pongState.scoreL = 0; pongState.scoreR = 0;
        pongState.baseSpeed = INITIAL_BASE_SPEED;
        pctx.fillStyle = "#0a0a0c"; pctx.fillRect(0, 0, W, H);
        if (currentGame === 'pong') { currentGame = null; leaveBtn.style.display = "none"; }
    };

    const startPong = () => {
        currentGame = 'pong';
        leaveBtn.style.display = "flex";
        allViews().forEach(v => v.style.display = "none");
        pongC.style.display = "block";
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        iG.style.opacity = "1"; iG.setAttribute('active', 'true');
        if (isHost) pongStartRound();
        if (!pongState.animFrame) pongLoop();
    };

    const pongStartRound = () => {
        if (!isHost) return;
        pongState.isRoundActive = false;
        pongState.baseSpeed = INITIAL_BASE_SPEED;
        if (pongState.speedInterval) clearInterval(pongState.speedInterval);
        pongState.ball = { x: 270, y: 170, dx: 0, dy: 0 };
        pongState.countdown = 3;
        let cd = setInterval(() => {
            pongState.countdown--;
            if (pongState.countdown <= 0) { clearInterval(cd); pongLaunchBall(); }
        }, 1000);
    };

    const pongLaunchBall = () => {
        const s = pongState;
        s.ball.dx = s.baseSpeed * (Math.random() > 0.5 ? 1 : -1);
        s.ball.dy = s.baseSpeed * (Math.random() > 0.5 ? 1 : -1);
        s.isRoundActive = true;
        s.speedInterval = setInterval(() => {
            if (s.isRoundActive) {
                s.baseSpeed *= 1.15;
                s.ball.dx = (s.ball.dx > 0 ? 1 : -1) * s.baseSpeed;
                s.ball.dy = (s.ball.dy > 0 ? 1 : -1) * s.baseSpeed;
            }
        }, 10000);
    };

    const pongDraw = () => {
        const s = pongState;
        pctx.fillStyle = "#0a0a0c"; pctx.fillRect(0, 0, W, H);
        pctx.strokeStyle = "rgba(255,255,255,0.05)"; pctx.setLineDash([5, 5]);
        pctx.beginPath(); pctx.moveTo(270, 0); pctx.lineTo(270, H); pctx.stroke();
        pctx.setLineDash([]);
        pctx.fillStyle = "rgba(255,95,31,0.4)";
        pctx.font = "bold 32px 'Segoe UI'"; pctx.textAlign = "center";
        if (isHost) { pctx.fillText(s.scoreL, 135, 50); pctx.fillText(s.scoreR, 405, 50); }
        else { pctx.fillText(s.scoreR, 135, 50); pctx.fillText(s.scoreL, 405, 50); }
        if (s.countdown > 0) {
            pctx.fillStyle = "#ff5f1f"; pctx.font = "bold 60px 'Segoe UI'";
            pctx.fillText(s.countdown, 270, 185);
        }
        pctx.fillStyle = "#ff5f1f";
        if (isHost) {
            pctx.fillRect(10, s.pL - 40, 4, 80); pctx.fillRect(526, s.pR - 40, 4, 80);
            pctx.beginPath(); pctx.arc(s.ball.x, s.ball.y, 4, 0, Math.PI * 2); pctx.fill();
        } else {
            pctx.fillRect(10, s.pR - 40, 4, 80); pctx.fillRect(526, s.pL - 40, 4, 80);
            pctx.beginPath(); pctx.arc(W - s.ball.x, s.ball.y, 4, 0, Math.PI * 2); pctx.fill();
        }
    };

    const pongLoop = () => {
        const s = pongState;
        if (isHost && isConnected()) {
            if (s.isRoundActive) {
                s.ball.x += s.ball.dx; s.ball.y += s.ball.dy;
                if (s.ball.y < 5 || s.ball.y > H - 5) s.ball.dy *= -1;
                if (s.ball.x < 20 && Math.abs(s.ball.y - s.pL) < 45) s.ball.dx = Math.abs(s.ball.dx);
                if (s.ball.x > W - 20 && Math.abs(s.ball.y - s.pR) < 45) s.ball.dx = -Math.abs(s.ball.dx);
                if (s.ball.x < 0) { s.scoreR++; pongStartRound(); }
                if (s.ball.x > W) { s.scoreL++; pongStartRound(); }
            }
            dc.send("G" + JSON.stringify({ b: s.ball, pL: s.pL, pR: s.pR, sL: s.scoreL, sR: s.scoreR, cd: s.countdown }));
        }
        pongDraw();
        s.animFrame = requestAnimationFrame(pongLoop);
    };

    pongC.onmousemove = (e) => {
        const rect = pongC.getBoundingClientRect();
        const y = e.clientY - rect.top;
        if (isHost) pongState.pL = y;
        else { pongState.pR = y; if (isConnected()) dc.send("P" + Math.floor(y)); }
    };

    // ============================================================
    //  SNAKE
    // ============================================================

    const rnd = (n) => Math.floor(Math.random() * n);

    const snakeInitState = () => ({
        snakes: {
            host: { body: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }], dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 }, alive: true, color: COLORS.host, score: 0, effects: {} },
            joiner: { body: [{ x: 25, y: 10 }, { x: 26, y: 10 }, { x: 27, y: 10 }], dir: { x: -1, y: 0 }, nextDir: { x: -1, y: 0 }, alive: true, color: COLORS.joiner, score: 0, effects: {} },
        },
        food: [],
        powerUps: [],
        winner: null,
        started: true,
        roundCountdown: 3,
        roundCountdownEnd: Date.now() + 3000,
    });

    const spawnFood = (state) => {
        const occupied = new Set();
        Object.values(state.snakes).forEach(s => s.body.forEach(c => occupied.add(`${c.x},${c.y}`)));
        let pos;
        do { pos = { x: rnd(COLS), y: rnd(ROWS) }; } while (occupied.has(`${pos.x},${pos.y}`));
        state.food.push(pos);
    };

    const spawnPowerUp = (state) => {
        if (state.powerUps.length >= 2) return;
        const occupied = new Set();
        Object.values(state.snakes).forEach(s => s.body.forEach(c => occupied.add(`${c.x},${c.y}`)));
        state.food.forEach(f => occupied.add(`${f.x},${f.y}`));
        let pos;
        do { pos = { x: rnd(COLS), y: rnd(ROWS) }; } while (occupied.has(`${pos.x},${pos.y}`));
        state.powerUps.push({ ...pos, type: POWERUP_TYPES[rnd(POWERUP_TYPES.length)] });
    };

    const snakeTick = (state) => {
        if (!state.started || state.winner) return;
        if (state.roundCountdown !== null && state.roundCountdown > 0) return;

        const keys = Object.keys(state.snakes);

        keys.forEach(k => {
            const snake = state.snakes[k];
            if (!snake.alive) return;
            snake.dir = { ...snake.nextDir };
            const head = snake.body[0];
            const newHead = {
                x: (head.x + snake.dir.x + COLS) % COLS,
                y: (head.y + snake.dir.y + ROWS) % ROWS,
            };
            snake.body.unshift(newHead);
            snake.body.pop();
        });

        keys.forEach(k => {
            const snake = state.snakes[k];
            if (!snake.alive) return;
            const head = snake.body[0];
            const fi = state.food.findIndex(f => f.x === head.x && f.y === head.y);
            if (fi !== -1) {
                state.food.splice(fi, 1);
                snake.body.push({ ...snake.body[snake.body.length - 1] });
                snake.score++;
                spawnFood(state);
            }
        });

        keys.forEach(k => {
            const snake = state.snakes[k];
            if (!snake.alive) return;
            const head = snake.body[0];
            const pi = state.powerUps.findIndex(p => p.x === head.x && p.y === head.y);
            if (pi !== -1) {
                const pu = state.powerUps.splice(pi, 1)[0];
                const otherKey = k === 'host' ? 'joiner' : 'host';
                const other = state.snakes[otherKey];
                if (pu.type === 'speed') snake.effects.speed = Date.now() + 4000;
                if (pu.type === 'shrink' && other.alive && other.body.length > 4) other.body.splice(-3, 3);
                spawnPowerUp(state);
            }
        });

        keys.forEach(k => {
            const snake = state.snakes[k];
            if (!snake.alive) return;
            const head = snake.body[0];
            const selfHit = snake.body.slice(1).some(seg => seg.x === head.x && seg.y === head.y);
            const otherHit = keys.filter(ok => ok !== k).some(ok =>
                state.snakes[ok].body.some(seg => seg.x === head.x && seg.y === head.y)
            );
            if (selfHit || otherHit) snake.alive = false;
        });

        const alive = keys.filter(k => state.snakes[k].alive);
        if (alive.length === 0) state.winner = 'draw';
        else if (alive.length === 1) state.winner = alive[0];

        return state;
    };

    const snakeDraw = (state) => {
        sctx.fillStyle = "#0a0a0c"; sctx.fillRect(0, 0, W, H);
        sctx.fillStyle = "rgba(255,255,255,0.03)";
        for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) {
            sctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
        }
        state.food.forEach(f => {
            sctx.fillStyle = "#22c55e";
            sctx.beginPath();
            sctx.arc(f.x * CELL + CELL / 2, f.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
            sctx.fill();
        });
        state.powerUps.forEach(p => {
            sctx.fillStyle = p.type === 'speed' ? '#facc15' : '#a855f7';
            const cx = p.x * CELL + CELL / 2, cy = p.y * CELL + CELL / 2;
            sctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
                const r = i % 2 === 0 ? CELL / 2 - 1 : CELL / 4;
                i === 0 ? sctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
                    : sctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
            }
            sctx.closePath(); sctx.fill();
            sctx.fillStyle = "#000"; sctx.font = "bold 7px sans-serif"; sctx.textAlign = "center";
            sctx.fillText(p.type === 'speed' ? "S" : "X", cx, cy + 2.5);
        });
        Object.values(state.snakes).forEach(snake => {
            snake.body.forEach((seg, i) => {
                const alpha = snake.alive ? (i === 0 ? 1 : 0.85 - (i / snake.body.length) * 0.3) : 0.25;
                sctx.globalAlpha = alpha;
                sctx.fillStyle = snake.color;
                const pad = i === 0 ? 1 : 2;
                sctx.beginPath();
                sctx.roundRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, i === 0 ? 4 : 3);
                sctx.fill();
                if (i === 0 && snake.alive) {
                    sctx.globalAlpha = 1;
                    sctx.fillStyle = "#000";
                    const ex = seg.x * CELL + CELL / 2 + snake.dir.x * 3;
                    const ey = seg.y * CELL + CELL / 2 + snake.dir.y * 3;
                    sctx.beginPath(); sctx.arc(ex + snake.dir.y * 3, ey - snake.dir.x * 3, 1.5, 0, Math.PI * 2); sctx.fill();
                    sctx.beginPath(); sctx.arc(ex - snake.dir.y * 3, ey + snake.dir.x * 3, 1.5, 0, Math.PI * 2); sctx.fill();
                }
            });
        });
        sctx.globalAlpha = 1;
        sctx.font = "bold 12px 'Segoe UI'"; sctx.textAlign = "left";
        const myKey = isHost ? 'host' : 'joiner';
        const theirKey = isHost ? 'joiner' : 'host';
        const me = state.snakes[myKey], them = state.snakes[theirKey];
        sctx.fillStyle = COLORS.host;
        sctx.fillText(`YOU  ${me ? me.score : 0}`, 10, 20);
        sctx.fillStyle = COLORS.joiner;
        sctx.fillText(`${peerName || 'PEER'}  ${them ? them.score : 0}`, 10, 36);
        if (me && me.effects.speed && Date.now() < me.effects.speed) {
            sctx.fillStyle = "#facc15"; sctx.font = "bold 10px 'Segoe UI'";
            sctx.fillText("⚡ SPEED", W - 80, 20);
        }
        if (state.roundCountdown !== null && state.roundCountdown > 0) {
            sctx.fillStyle = "rgba(0,0,0,0.55)"; sctx.fillRect(0, 0, W, H);
            sctx.fillStyle = "#ff5f1f"; sctx.font = "bold 72px 'Segoe UI'"; sctx.textAlign = "center";
            sctx.fillText(state.roundCountdown, W / 2, H / 2 + 24);
            sctx.fillStyle = "#52525b"; sctx.font = "13px 'Segoe UI'";
            sctx.fillText("GET READY", W / 2, H / 2 - 40);
        }
        if (state.winner) {
            sctx.fillStyle = "rgba(0,0,0,0.7)"; sctx.fillRect(0, 0, W, H);
            sctx.fillStyle = "#ff5f1f"; sctx.font = "bold 36px 'Segoe UI'"; sctx.textAlign = "center";
            const isWinner = state.winner === myKey;
            sctx.fillText(state.winner === 'draw' ? 'DRAW' : isWinner ? 'YOU WIN!' : 'YOU LOSE!', W / 2, H / 2 - 20);
            if (state.restartCountdown && state.restartCountdown > 0) {
                sctx.fillStyle = "#52525b"; sctx.font = "14px 'Segoe UI'";
                sctx.fillText(`New round in ${state.restartCountdown}...`, W / 2, H / 2 + 20);
            }
        }
    };

    let snakeTickAccum = 0;
    let snakeLastTime = 0;
    let snakeRestartTimer = null;

    const snakeRenderLoop = (time) => {
        const delta = time - snakeLastTime;
        snakeLastTime = time;

        if (isHost && isConnected() && snakeState.started && !snakeState.winner) {
            snakeTickAccum += delta;
            if (snakeState.roundCountdown !== null && snakeState.roundCountdown > 0) {
                const remaining = Math.ceil((snakeState.roundCountdownEnd - Date.now()) / 1000);
                snakeState.roundCountdown = Math.max(0, remaining);
            }
            const hostSnake = snakeState.snakes.host;
            const tickRate = (hostSnake && hostSnake.effects.speed && Date.now() < hostSnake.effects.speed) ? TICK / 2 : TICK;
            if (snakeTickAccum >= tickRate) {
                snakeTickAccum = 0;
                snakeTick(snakeState);
                if (snakeState.winner && !snakeRestartTimer) {
                    snakeState.restartCountdown = 3;
                    const restartTick = () => {
                        snakeState.restartCountdown--;
                        if (isConnected()) dc.send("S" + JSON.stringify(snakeState));
                        if (snakeState.restartCountdown <= 0) {
                            snakeRestartTimer = null;
                            snakeRestartRound();
                        } else {
                            snakeRestartTimer = setTimeout(restartTick, 1000);
                        }
                    };
                    snakeRestartTimer = setTimeout(restartTick, 1000);
                }
                if (isConnected()) dc.send("S" + JSON.stringify(snakeState));
            }
        }

        if (snakeState.started || Object.keys(snakeState.snakes).length > 0) {
            snakeDraw(snakeState);
        }

        snakeState.animFrame = requestAnimationFrame(snakeRenderLoop);
    };

    const snakeRestartRound = () => {
        if (!isHost) return;
        const fresh = snakeInitState();
        spawnFood(fresh); spawnFood(fresh); spawnFood(fresh);
        spawnPowerUp(fresh);
        snakeState = { ...fresh, animFrame: snakeState.animFrame };
        snakeTickAccum = 0;
        if (isConnected()) dc.send("S" + JSON.stringify(snakeState));
    };

    const startSnake = () => {
        currentGame = 'snake';
        leaveBtn.style.display = "flex";
        allViews().forEach(v => v.style.display = "none");
        snakeC.style.display = "block";
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        iG.style.opacity = "1"; iG.setAttribute('active', 'true');
        if (isHost) {
            snakeState = snakeInitState();
            spawnFood(snakeState); spawnFood(snakeState); spawnFood(snakeState);
            spawnPowerUp(snakeState);
            if (isConnected()) dc.send("S" + JSON.stringify(snakeState));
        }
        snakeLastTime = performance.now();
        snakeTickAccum = 0;
        if (snakeState.animFrame) cancelAnimationFrame(snakeState.animFrame);
        snakeState.animFrame = requestAnimationFrame(snakeRenderLoop);
    };

    const stopSnake = () => {
        if (snakeRestartTimer) { clearTimeout(snakeRestartTimer); snakeRestartTimer = null; }
        if (snakeState.animFrame) { cancelAnimationFrame(snakeState.animFrame); }
        snakeState = { snakes: {}, food: [], powerUps: [], animFrame: null, tickTimer: null, winner: null, started: false, roundCountdown: null, roundCountdownEnd: null };
        sctx.fillStyle = "#0a0a0c"; sctx.fillRect(0, 0, W, H);
        if (currentGame === 'snake') { currentGame = null; leaveBtn.style.display = "none"; }
    };

    const snakeKeyMap = {
        'ArrowUp': { x: 0, y: -1 }, 'w': { x: 0, y: -1 }, 'W': { x: 0, y: -1 },
        'ArrowDown': { x: 0, y: 1 }, 's': { x: 0, y: 1 }, 'S': { x: 0, y: 1 },
        'ArrowLeft': { x: -1, y: 0 }, 'a': { x: -1, y: 0 }, 'A': { x: -1, y: 0 },
        'ArrowRight': { x: 1, y: 0 }, 'd': { x: 1, y: 0 }, 'D': { x: 1, y: 0 },
    };

    // ============================================================
    //  TIC TAC TOE
    // ============================================================

    const TTT_CELL = 80;
    const TTT_GRID_X = (W - TTT_CELL * 3) / 2;
    const TTT_GRID_Y = (H - TTT_CELL * 3) / 2;
    const TTT_X_COLOR = '#ff5f1f';
    const TTT_O_COLOR = '#3b82f6';

    const TTT_WINS = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    const tttCheckWinner = (board) => {
        for (const combo of TTT_WINS) {
            const [a, b, c] = combo;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return { winner: board[a], line: combo };
            }
        }
        if (board.every(cell => cell !== null)) return { winner: 'draw', line: null };
        return null;
    };

    const tttInitState = (keepScores) => ({
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        winLine: null,
        restartCountdown: null,
        scores: keepScores || { X: 0, O: 0 },
    });

    const tttCellIndex = (mx, my) => {
        const col = Math.floor((mx - TTT_GRID_X) / TTT_CELL);
        const row = Math.floor((my - TTT_GRID_Y) / TTT_CELL);
        if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
        return row * 3 + col;
    };

    const tttCellCenter = (idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        return {
            x: TTT_GRID_X + col * TTT_CELL + TTT_CELL / 2,
            y: TTT_GRID_Y + row * TTT_CELL + TTT_CELL / 2,
        };
    };

    const tttDraw = (state, winProg) => {
        const myMark = isHost ? 'X' : 'O';

        tctx.fillStyle = "#0a0a0c";
        tctx.fillRect(0, 0, W, H);

        tctx.font = "bold 13px 'Segoe UI'";
        tctx.textAlign = "left";
        tctx.fillStyle = TTT_X_COLOR;
        tctx.fillText(`${isHost ? 'YOU' : (peerName || 'PEER')} (X)  ${state.scores.X}`, 20, 24);
        tctx.textAlign = "right";
        tctx.fillStyle = TTT_O_COLOR;
        tctx.fillText(`${state.scores.O}  (O) ${!isHost ? 'YOU' : (peerName || 'PEER')}`, W - 20, 24);

        if (!state.winner) {
            const isMyTurn = state.turn === myMark;
            tctx.textAlign = "center";
            tctx.font = "12px 'Segoe UI'";
            tctx.fillStyle = isMyTurn ? "#ff5f1f" : "#52525b";
            tctx.fillText(isMyTurn ? "YOUR TURN" : "THEIR TURN", W / 2, 24);
        }

        tctx.strokeStyle = '#27272a';
        tctx.lineWidth = 2;
        tctx.lineCap = "round";
        for (let i = 1; i <= 2; i++) {
            tctx.beginPath();
            tctx.moveTo(TTT_GRID_X + i * TTT_CELL, TTT_GRID_Y);
            tctx.lineTo(TTT_GRID_X + i * TTT_CELL, TTT_GRID_Y + TTT_CELL * 3);
            tctx.stroke();
            tctx.beginPath();
            tctx.moveTo(TTT_GRID_X, TTT_GRID_Y + i * TTT_CELL);
            tctx.lineTo(TTT_GRID_X + TTT_CELL * 3, TTT_GRID_Y + i * TTT_CELL);
            tctx.stroke();
        }

        const pad = 18;
        state.board.forEach((mark, idx) => {
            if (!mark) return;
            const { x, y } = tttCellCenter(idx);
            if (mark === 'X') {
                tctx.strokeStyle = TTT_X_COLOR;
                tctx.lineWidth = 4;
                tctx.beginPath();
                tctx.moveTo(x - pad, y - pad); tctx.lineTo(x + pad, y + pad);
                tctx.stroke();
                tctx.beginPath();
                tctx.moveTo(x + pad, y - pad); tctx.lineTo(x - pad, y + pad);
                tctx.stroke();
            } else {
                tctx.strokeStyle = TTT_O_COLOR;
                tctx.lineWidth = 4;
                tctx.beginPath();
                tctx.arc(x, y, pad, 0, Math.PI * 2);
                tctx.stroke();
            }
        });

        if (state.winLine && winProg > 0) {
            const a = tttCellCenter(state.winLine[0]);
            const b = tttCellCenter(state.winLine[2]);
            const wx = a.x + (b.x - a.x) * winProg;
            const wy = a.y + (b.y - a.y) * winProg;
            const winColor = state.winner === 'X' ? TTT_X_COLOR : TTT_O_COLOR;
            tctx.strokeStyle = winColor;
            tctx.lineWidth = 5;
            tctx.globalAlpha = 0.85;
            tctx.beginPath();
            tctx.moveTo(a.x, a.y);
            tctx.lineTo(wx, wy);
            tctx.stroke();
            tctx.globalAlpha = 1;
        }

        if (state.winner) {
            tctx.fillStyle = "rgba(0,0,0,0.65)";
            tctx.fillRect(0, 0, W, H);
            tctx.textAlign = "center";
            tctx.font = "bold 38px 'Segoe UI'";
            let resultText, resultColor;
            if (state.winner === 'draw') {
                resultText = "DRAW!";
                resultColor = "#a1a1aa";
            } else if (state.winner === myMark) {
                resultText = "YOU WIN!";
                resultColor = "#ff5f1f";
            } else {
                resultText = "YOU LOSE!";
                resultColor = "#3b82f6";
            }
            tctx.fillStyle = resultColor;
            tctx.fillText(resultText, W / 2, H / 2 - 16);
            if (state.restartCountdown && state.restartCountdown > 0) {
                tctx.fillStyle = "#52525b";
                tctx.font = "14px 'Segoe UI'";
                tctx.fillText(`New round in ${state.restartCountdown}...`, W / 2, H / 2 + 22);
            }
        }
    };

    const tttRenderLoop = () => {
        if (tttState.winLine && tttWinProgress < 1) {
            tttWinProgress = Math.min(1, tttWinProgress + 0.05);
        }
        tttDraw(tttState, tttWinProgress);
        tttAnimFrame = requestAnimationFrame(tttRenderLoop);
    };

    const tttPlaceMark = (idx) => {
        if (tttState.board[idx] !== null || tttState.winner) return;
        tttState.board[idx] = tttState.turn;

        const result = tttCheckWinner(tttState.board);
        if (result) {
            tttState.winner = result.winner;
            tttState.winLine = result.line;
            tttWinProgress = 0;
            if (result.winner !== 'draw') tttState.scores[result.winner]++;
            tttTriggerRestart();
        } else {
            tttState.turn = tttState.turn === 'X' ? 'O' : 'X';
        }

        if (isConnected()) dc.send("T" + JSON.stringify(tttState));
    };

    const tttTriggerRestart = () => {
        if (tttRestartTimer) return;
        tttState.restartCountdown = 3;
        if (isConnected()) dc.send("T" + JSON.stringify(tttState));
        const tick = () => {
            tttState.restartCountdown--;
            if (isConnected()) dc.send("T" + JSON.stringify(tttState));
            if (tttState.restartCountdown <= 0) {
                tttRestartTimer = null;
                const fresh = tttInitState(tttState.scores);
                tttState = fresh;
                tttWinProgress = 0;
                if (isConnected()) dc.send("T" + JSON.stringify(tttState));
            } else {
                tttRestartTimer = setTimeout(tick, 1000);
            }
        };
        tttRestartTimer = setTimeout(tick, 1000);
    };

    const startTTT = () => {
        currentGame = 'ttt';
        leaveBtn.style.display = "flex";
        allViews().forEach(v => v.style.display = "none");
        tttC.style.display = "block";
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        iG.style.opacity = "1"; iG.setAttribute('active', 'true');

        if (isHost) {
            tttState = tttInitState();
            tttWinProgress = 0;
            if (isConnected()) dc.send("T" + JSON.stringify(tttState));
        }

        if (tttAnimFrame) cancelAnimationFrame(tttAnimFrame);
        tttAnimFrame = requestAnimationFrame(tttRenderLoop);
    };

    const stopTTT = () => {
        if (tttRestartTimer) { clearTimeout(tttRestartTimer); tttRestartTimer = null; }
        if (tttAnimFrame) { cancelAnimationFrame(tttAnimFrame); tttAnimFrame = null; }
        tttState = tttInitState();
        tttWinProgress = 0;
        tctx.fillStyle = "#0a0a0c"; tctx.fillRect(0, 0, W, H);
        if (currentGame === 'ttt') { currentGame = null; leaveBtn.style.display = "none"; }
    };

    tttC.onclick = (e) => {
        if (currentGame !== 'ttt') return;
        if (tttState.winner) return;

        const myMark = isHost ? 'X' : 'O';
        if (tttState.turn !== myMark) return;

        const rect = tttC.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const idx = tttCellIndex(mx, my);
        if (idx === -1 || tttState.board[idx] !== null) return;

        if (isHost) {
            tttPlaceMark(idx);
        } else {
            if (isConnected()) dc.send("TM" + idx);
        }
    };

    tttC.onmousemove = (e) => {
        if (currentGame !== 'ttt' || tttState.winner) { tttC.style.cursor = "default"; return; }
        const myMark = isHost ? 'X' : 'O';
        if (tttState.turn !== myMark) { tttC.style.cursor = "default"; return; }
        const rect = tttC.getBoundingClientRect();
        const idx = tttCellIndex(e.clientX - rect.left, e.clientY - rect.top);
        tttC.style.cursor = (idx !== -1 && tttState.board[idx] === null) ? "pointer" : "default";
    };

    // ============================================================
    //  CONNECT 4
    // ============================================================

    const C4_RED = '#ef4444';
    const C4_YELLOW = '#eab308';
    const C4_BOARD_BG = '#1e3a5f';
    const C4_HOLE = '#0a0a0c';

    const c4InitState = (keepScores) => ({
        board: Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null)),
        turn: 'R',
        winner: null,
        winCells: null,
        restartCountdown: null,
        scores: keepScores || { R: 0, Y: 0 },
    });

    const c4Drop = (board, col) => {
        for (let r = C4_ROWS - 1; r >= 0; r--) {
            if (board[r][col] === null) return r;
        }
        return -1;
    };

    const c4CheckWinner = (board) => {
        const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let r = 0; r < C4_ROWS; r++) {
            for (let c = 0; c < C4_COLS; c++) {
                const v = board[r][c];
                if (!v) continue;
                for (const [dr, dc] of dirs) {
                    const cells = [{ r, c }];
                    for (let i = 1; i < 4; i++) {
                        const nr = r + dr * i, nc = c + dc * i;
                        if (nr < 0 || nr >= C4_ROWS || nc < 0 || nc >= C4_COLS || board[nr][nc] !== v) break;
                        cells.push({ r: nr, c: nc });
                    }
                    if (cells.length === 4) return { winner: v, cells };
                }
            }
        }
        if (board[0].every(cell => cell !== null)) return { winner: 'draw', cells: null };
        return null;
    };

    const c4CellCenter = (r, c) => ({
        x: C4_BOARD_X + c * C4_CELL + C4_CELL / 2,
        y: C4_BOARD_Y + r * C4_CELL + C4_CELL / 2,
    });

    const c4Draw = (state, hoverCol, winProg) => {
        c4ctx.fillStyle = "#0a0a0c";
        c4ctx.fillRect(0, 0, W, H);

        const myDisc = isHost ? 'R' : 'Y';
        c4ctx.font = "bold 12px 'Segoe UI'";
        c4ctx.textAlign = "left";
        c4ctx.fillStyle = C4_RED;
        c4ctx.fillText(`${isHost ? 'YOU' : (peerName || 'PEER')} (●)  ${state.scores.R}`, 8, 18);
        c4ctx.textAlign = "right";
        c4ctx.fillStyle = C4_YELLOW;
        c4ctx.fillText(`${state.scores.Y}  (●) ${!isHost ? 'YOU' : (peerName || 'PEER')}`, W - 8, 18);

        if (!state.winner) {
            const isMyTurn = state.turn === myDisc;
            c4ctx.textAlign = "center";
            c4ctx.font = "11px 'Segoe UI'";
            c4ctx.fillStyle = isMyTurn ? (isHost ? C4_RED : C4_YELLOW) : "#52525b";
            c4ctx.fillText(isMyTurn ? "YOUR TURN" : "THEIR TURN", W / 2, 18);
        }

        if (!state.winner && hoverCol >= 0 && state.turn === myDisc) {
            c4ctx.fillStyle = "rgba(255,255,255,0.04)";
            c4ctx.fillRect(C4_BOARD_X + hoverCol * C4_CELL, C4_BOARD_Y, C4_CELL, C4_ROWS * C4_CELL);

            const ghostRow = c4Drop(state.board, hoverCol);
            if (ghostRow >= 0) {
                const { x, y } = c4CellCenter(ghostRow, hoverCol);
                c4ctx.globalAlpha = 0.35;
                c4ctx.fillStyle = myDisc === 'R' ? C4_RED : C4_YELLOW;
                c4ctx.beginPath();
                c4ctx.arc(x, y, C4_R, 0, Math.PI * 2);
                c4ctx.fill();
                c4ctx.globalAlpha = 1;
            }
        }

        const bx = C4_BOARD_X - 4, by = C4_BOARD_Y - 4;
        const bw = C4_COLS * C4_CELL + 8, bh = C4_ROWS * C4_CELL + 8;
        c4ctx.fillStyle = C4_BOARD_BG;
        c4ctx.beginPath();
        c4ctx.roundRect(bx, by, bw, bh, 8);
        c4ctx.fill();

        for (let r = 0; r < C4_ROWS; r++) {
            for (let c = 0; c < C4_COLS; c++) {
                const { x, y } = c4CellCenter(r, c);
                const v = state.board[r][c];

                const isWinCell = state.winCells && winProg > 0 &&
                    state.winCells.some(wc => wc.r === r && wc.c === c);

                if (v) {
                    c4ctx.fillStyle = v === 'R' ? C4_RED : C4_YELLOW;
                    if (isWinCell) {
                        c4ctx.globalAlpha = 0.5 + 0.5 * winProg;
                    }
                    c4ctx.beginPath();
                    c4ctx.arc(x, y, C4_R, 0, Math.PI * 2);
                    c4ctx.fill();
                    c4ctx.globalAlpha = 1;

                    c4ctx.fillStyle = "rgba(255,255,255,0.12)";
                    c4ctx.beginPath();
                    c4ctx.arc(x - 3, y - 4, C4_R * 0.45, 0, Math.PI * 2);
                    c4ctx.fill();
                } else {
                    c4ctx.fillStyle = C4_HOLE;
                    c4ctx.beginPath();
                    c4ctx.arc(x, y, C4_R, 0, Math.PI * 2);
                    c4ctx.fill();
                }
            }
        }

        if (state.winCells && state.winner !== 'draw' && winProg > 0) {
            const first = c4CellCenter(state.winCells[0].r, state.winCells[0].c);
            const last = c4CellCenter(state.winCells[3].r, state.winCells[3].c);
            const ex = first.x + (last.x - first.x) * winProg;
            const ey = first.y + (last.y - first.y) * winProg;
            c4ctx.strokeStyle = "rgba(255,255,255,0.9)";
            c4ctx.lineWidth = 4;
            c4ctx.lineCap = "round";
            c4ctx.globalAlpha = 0.9;
            c4ctx.beginPath();
            c4ctx.moveTo(first.x, first.y);
            c4ctx.lineTo(ex, ey);
            c4ctx.stroke();
            c4ctx.globalAlpha = 1;
        }

        if (state.winner) {
            c4ctx.fillStyle = "rgba(0,0,0,0.65)";
            c4ctx.fillRect(0, 0, W, H);
            c4ctx.textAlign = "center";
            c4ctx.font = "bold 36px 'Segoe UI'";
            let resultText, resultColor;
            if (state.winner === 'draw') {
                resultText = "DRAW!";
                resultColor = "#a1a1aa";
            } else if (state.winner === myDisc) {
                resultText = "YOU WIN!";
                resultColor = myDisc === 'R' ? C4_RED : C4_YELLOW;
            } else {
                resultText = "YOU LOSE!";
                resultColor = myDisc === 'R' ? C4_YELLOW : C4_RED;
            }
            c4ctx.fillStyle = resultColor;
            c4ctx.fillText(resultText, W / 2, H / 2 - 14);
            if (state.restartCountdown && state.restartCountdown > 0) {
                c4ctx.fillStyle = "#52525b";
                c4ctx.font = "13px 'Segoe UI'";
                c4ctx.fillText(`New round in ${state.restartCountdown}...`, W / 2, H / 2 + 20);
            }
        }
    };

    const c4RenderLoop = () => {
        if (c4State.winCells && c4WinProgress < 1) {
            c4WinProgress = Math.min(1, c4WinProgress + 0.05);
        }
        c4Draw(c4State, c4HoverCol, c4WinProgress);
        c4AnimFrame = requestAnimationFrame(c4RenderLoop);
    };

    const c4PlacePiece = (col) => {
        if (c4State.winner) return;
        const row = c4Drop(c4State.board, col);
        if (row < 0) return;

        c4State.board[row][col] = c4State.turn;

        const result = c4CheckWinner(c4State.board);
        if (result) {
            c4State.winner = result.winner;
            c4State.winCells = result.cells;
            c4WinProgress = 0;
            if (result.winner !== 'draw') c4State.scores[result.winner]++;
            c4TriggerRestart();
        } else {
            c4State.turn = c4State.turn === 'R' ? 'Y' : 'R';
        }

        if (isConnected()) dc.send("F" + JSON.stringify(c4State));
    };

    const c4TriggerRestart = () => {
        if (c4RestartTimer) return;
        c4State.restartCountdown = 3;
        if (isConnected()) dc.send("F" + JSON.stringify(c4State));
        const tick = () => {
            c4State.restartCountdown--;
            if (isConnected()) dc.send("F" + JSON.stringify(c4State));
            if (c4State.restartCountdown <= 0) {
                c4RestartTimer = null;
                const fresh = c4InitState(c4State.scores);
                c4State = fresh;
                c4WinProgress = 0;
                if (isConnected()) dc.send("F" + JSON.stringify(c4State));
            } else {
                c4RestartTimer = setTimeout(tick, 1000);
            }
        };
        c4RestartTimer = setTimeout(tick, 1000);
    };

    const startC4 = () => {
        currentGame = 'c4';
        leaveBtn.style.display = "flex";
        allViews().forEach(v => v.style.display = "none");
        c4C.style.display = "block";
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        iG.style.opacity = "1"; iG.setAttribute('active', 'true');

        if (isHost) {
            c4State = c4InitState();
            c4WinProgress = 0;
            if (isConnected()) dc.send("F" + JSON.stringify(c4State));
        }

        if (c4AnimFrame) cancelAnimationFrame(c4AnimFrame);
        c4AnimFrame = requestAnimationFrame(c4RenderLoop);
    };

    const stopC4 = () => {
        if (c4RestartTimer) { clearTimeout(c4RestartTimer); c4RestartTimer = null; }
        if (c4AnimFrame) { cancelAnimationFrame(c4AnimFrame); c4AnimFrame = null; }
        c4State = c4InitState();
        c4WinProgress = 0;
        c4HoverCol = -1;
        c4ctx.fillStyle = "#0a0a0c"; c4ctx.fillRect(0, 0, W, H);
        if (currentGame === 'c4') { currentGame = null; leaveBtn.style.display = "none"; }
    };

    c4C.onclick = (e) => {
        if (currentGame !== 'c4') return;
        if (c4State.winner) return;
        const myDisc = isHost ? 'R' : 'Y';
        if (c4State.turn !== myDisc) return;

        const rect = c4C.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const col = Math.floor((mx - C4_BOARD_X) / C4_CELL);
        if (col < 0 || col >= C4_COLS) return;

        if (isHost) {
            c4PlacePiece(col);
        } else {
            if (isConnected()) dc.send("FM" + col);
        }
    };

    c4C.onmousemove = (e) => {
        if (currentGame !== 'c4') return;
        const rect = c4C.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const col = Math.floor((mx - C4_BOARD_X) / C4_CELL);
        const myDisc = isHost ? 'R' : 'Y';
        const isMyTurn = !c4State.winner && c4State.turn === myDisc;
        c4HoverCol = (col >= 0 && col < C4_COLS && isMyTurn) ? col : -1;
        c4C.style.cursor = (c4HoverCol >= 0) ? "pointer" : "default";
    };

    c4C.onmouseleave = () => { c4HoverCol = -1; };

    // ============================================================
    //  ROCK PAPER SCISSORS
    // ============================================================

    const RPS_EMOJI = { R: '✊', P: '🖐', S: '✌️' };
    const RPS_LABEL = { R: 'ROCK', P: 'PAPER', S: 'SCISSORS' };
    const RPS_BEAT_WORDS = ['ROCK...', 'PAPER...', 'SCISSORS...', 'SHOOT!'];
    const RPS_WINS_OVER = { R: 'S', P: 'R', S: 'P' };

    const RPS_BEAT_MS = 420;
    const RPS_BEATS = 4;
    const RPS_TOTAL_MS = RPS_BEAT_MS * RPS_BEATS;

    const rpsInitState = (keepScores) => ({
        hostChoice: null,
        joinerChoice: null,
        hostReady: false,
        joinerReady: false,
        phase: 'choose',
        roundWinner: null,
        seriesWinner: null,
        round: 1,
        restartCountdown: null,
        scores: keepScores || { host: 0, joiner: 0 },
        shakeStartTime: null,
    });

    const rpsResolveRound = (state) => {
        const h = state.hostChoice, j = state.joinerChoice;
        if (h === j) return 'draw';
        return RPS_WINS_OVER[h] === j ? 'host' : 'joiner';
    };

    const rpsDrawHeader = (state) => {
        const myKey = isHost ? 'host' : 'joiner';
        const theirKey = isHost ? 'joiner' : 'host';

        rctx.font = "bold 12px 'Segoe UI'";
        rctx.textAlign = "left";
        rctx.fillStyle = "#ff5f1f";
        rctx.fillText(`YOU  ${state.scores[myKey]}`, 14, 20);
        rctx.textAlign = "right";
        rctx.fillStyle = "#3b82f6";
        rctx.fillText(`${state.scores[theirKey]}  ${peerName || 'PEER'}`, W - 14, 20);

        const pipR = 5, pipSpacing = 16;
        const pipStartX = W / 2 - (4 * pipSpacing) / 2;
        for (let i = 0; i < 5; i++) {
            const px = pipStartX + i * pipSpacing;
            rctx.beginPath();
            rctx.arc(px, 18, pipR, 0, Math.PI * 2);
            if (i < state.scores[myKey]) rctx.fillStyle = "#ff5f1f";
            else if (i >= 5 - state.scores[theirKey]) rctx.fillStyle = "#3b82f6";
            else rctx.fillStyle = "#27272a";
            rctx.fill();
        }

        rctx.textAlign = "center";
        rctx.font = "10px 'Segoe UI'";
        rctx.fillStyle = "#3f3f46";
        rctx.fillText(`ROUND ${state.round}  •  FIRST TO 3`, W / 2, 38);
    };

    const rpsDrawHand = (choice, cx, cy, { yOffset = 0, revealScale = 1, dimmed = false, revealed = true } = {}) => {
        rctx.save();
        rctx.translate(cx, cy + yOffset);
        rctx.scale(revealScale, revealScale);
        if (dimmed) rctx.globalAlpha = 0.22;

        const emoji = revealed ? (RPS_EMOJI[choice] || '✊') : '✊';
        rctx.font = "64px serif";
        rctx.textAlign = "center";
        rctx.textBaseline = "middle";
        rctx.fillText(emoji, 0, 0);

        if (revealed && choice) {
            rctx.globalAlpha = dimmed ? 0.22 : 1;
            rctx.font = "bold 12px 'Segoe UI'";
            rctx.textBaseline = "alphabetic";
            rctx.fillStyle = "#52525b";
            rctx.fillText(RPS_LABEL[choice], 0, 44);
        }
        rctx.restore();
    };

    const RPS_BTN_Y = H - 68;
    const RPS_BTN_W = 80, RPS_BTN_H = 52;
    const RPS_BTNS = [
        { key: 'R', x: W / 2 - 110 },
        { key: 'P', x: W / 2 },
        { key: 'S', x: W / 2 + 110 },
    ];

    const rpsDraw = (state, now) => {
        rctx.fillStyle = "#0a0a0c";
        rctx.fillRect(0, 0, W, H);

        const myKey = isHost ? 'host' : 'joiner';
        const theirKey = isHost ? 'joiner' : 'host';

        rpsDrawHeader(state);

        if (state.phase === 'choose') {
            const myChoice = state[myKey + 'Choice'];
            const theirReady = state[theirKey + 'Ready'];

            rctx.font = "bold 14px 'Segoe UI'";
            rctx.fillStyle = "#27272a";
            rctx.textAlign = "center";
            rctx.fillText("VS", W / 2, H / 2 + 8);

            rpsDrawHand(myChoice, 145, H / 2 - 10, { revealed: false, dimmed: !myChoice });
            rctx.font = "bold 11px 'Segoe UI'";
            rctx.textAlign = "center";
            rctx.textBaseline = "alphabetic";
            if (myChoice) {
                rctx.fillStyle = "#22c55e";
                rctx.fillText("✓ LOCKED IN", 145, H / 2 + 60);
            } else {
                rctx.fillStyle = "#52525b";
                rctx.fillText("CHOOSE BELOW", 145, H / 2 + 60);
            }

            rpsDrawHand(null, W - 145, H / 2 - 10, { revealed: false, dimmed: true });
            rctx.font = "bold 11px 'Segoe UI'";
            rctx.textAlign = "center";
            rctx.fillStyle = theirReady ? "#22c55e" : "#52525b";
            rctx.fillText(theirReady ? "✓ READY" : "WAITING...", W - 145, H / 2 + 60);

            RPS_BTNS.forEach(btn => {
                const bx = btn.x - RPS_BTN_W / 2;
                const isSelected = myChoice === btn.key;
                rctx.fillStyle = isSelected ? "#ff5f1f" : "#111114";
                rctx.strokeStyle = isSelected ? "#ff5f1f" : "#27272a";
                rctx.lineWidth = isSelected ? 2 : 1;
                rctx.beginPath();
                rctx.roundRect(bx, RPS_BTN_Y, RPS_BTN_W, RPS_BTN_H, 10);
                rctx.fill();
                rctx.stroke();
                rctx.font = "28px serif";
                rctx.textAlign = "center";
                rctx.textBaseline = "middle";
                rctx.fillText(RPS_EMOJI[btn.key], btn.x, RPS_BTN_Y + 22);
                rctx.font = "bold 9px 'Segoe UI'";
                rctx.textBaseline = "alphabetic";
                rctx.fillStyle = isSelected ? "#000" : "#52525b";
                rctx.fillText(RPS_LABEL[btn.key], btn.x, RPS_BTN_Y + 46);
            });

        } else if (state.phase === 'shake') {
            const elapsed = now - (state.shakeStartTime || now);
            const beatF = Math.min(elapsed / RPS_BEAT_MS, RPS_BEATS);
            const beatIdx = Math.min(Math.floor(beatF), RPS_BEATS - 1);
            const beatProg = beatF - beatIdx;

            let yOffset;
            if (beatIdx < 3) {
                const t = beatProg < 0.5
                    ? 2 * beatProg * beatProg
                    : 1 - Math.pow(-2 * beatProg + 2, 2) / 2;
                yOffset = Math.sin(t * Math.PI) * 28;
            } else {
                const t = Math.min(beatProg * 2.5, 1);
                yOffset = t * t * 32;
            }

            const word = RPS_BEAT_WORDS[beatIdx];
            const wordAlpha = beatIdx < 3
                ? Math.min(beatProg * 4, 1) * (1 - Math.max((beatProg - 0.6) / 0.4, 0))
                : Math.min(beatProg * 3, 1);
            rctx.globalAlpha = wordAlpha;
            rctx.font = beatIdx === 3 ? "bold 28px 'Segoe UI'" : "bold 20px 'Segoe UI'";
            rctx.textAlign = "center";
            rctx.textBaseline = "alphabetic";
            rctx.fillStyle = beatIdx === 3 ? "#ff5f1f" : "#a1a1aa";
            rctx.fillText(word, W / 2, H / 2 + 70);
            rctx.globalAlpha = 1;

            rpsDrawHand(null, 145, H / 2 - 10, { revealed: false, yOffset, dimmed: false });
            rpsDrawHand(null, W - 145, H / 2 - 10, { revealed: false, yOffset, dimmed: false });

            rctx.font = "bold 14px 'Segoe UI'";
            rctx.fillStyle = "#1f1f23";
            rctx.textAlign = "center";
            rctx.fillText("VS", W / 2, H / 2 + 8);

        } else if (state.phase === 'reveal' || state.phase === 'result') {
            const hChoice = state.hostChoice;
            const jChoice = state.joinerChoice;
            const leftChoice = isHost ? hChoice : jChoice;
            const rightChoice = isHost ? jChoice : hChoice;

            const elapsed = now - (rpsRevealStart || now);
            const popT = Math.min(elapsed / 320, 1);
            const spring = popT < 0.6
                ? (popT / 0.6) * 1.18
                : 1.18 - (((popT - 0.6) / 0.4)) * 0.18;
            const revealScale = Math.max(0.01, spring);

            rpsDrawHand(leftChoice, 145, H / 2 - 20, { revealed: true, revealScale });
            rpsDrawHand(rightChoice, W - 145, H / 2 - 20, { revealed: true, revealScale });

            if (state.roundWinner && popT > 0.3) {
                const bannerAlpha = Math.min((popT - 0.3) / 0.3, 1);
                rctx.globalAlpha = bannerAlpha;
                let resultText, resultColor;
                if (state.roundWinner === 'draw') { resultText = "DRAW"; resultColor = "#a1a1aa"; }
                else if (state.roundWinner === myKey) { resultText = "YOU WIN!"; resultColor = "#ff5f1f"; }
                else { resultText = "YOU LOSE"; resultColor = "#3b82f6"; }
                rctx.font = "bold 22px 'Segoe UI'";
                rctx.textAlign = "center";
                rctx.textBaseline = "alphabetic";
                rctx.fillStyle = resultColor;
                rctx.fillText(resultText, W / 2, H / 2 - 60);
                rctx.globalAlpha = 1;
            }

            rctx.font = "bold 13px 'Segoe UI'";
            rctx.fillStyle = "#1f1f23";
            rctx.textAlign = "center";
            rctx.fillText("VS", W / 2, H / 2 + 8);

            if (state.seriesWinner) {
                rctx.fillStyle = "rgba(0,0,0,0.75)";
                rctx.fillRect(0, 0, W, H);
                const isIWinner = state.seriesWinner === myKey;
                rctx.font = "bold 42px 'Segoe UI'";
                rctx.textAlign = "center";
                rctx.textBaseline = "alphabetic";
                rctx.fillStyle = isIWinner ? "#ff5f1f" : "#3b82f6";
                rctx.fillText(isIWinner ? "YOU WIN!" : "YOU LOSE!", W / 2, H / 2 - 14);
                rctx.font = "13px 'Segoe UI'";
                rctx.fillStyle = "#52525b";
                const sc = state.scores;
                rctx.fillText(`${sc[myKey]} — ${sc[theirKey]}`, W / 2, H / 2 + 22);
                if (state.restartCountdown && state.restartCountdown > 0) {
                    rctx.fillText(`New series in ${state.restartCountdown}...`, W / 2, H / 2 + 46);
                }
            }
        }
    };

    let rpsRevealStart = null;
    let rpsPrevPhase = null;

    const rpsRenderLoop = () => {
        const now = performance.now();

        if (rpsState.phase === 'reveal' && rpsPrevPhase !== 'reveal' && rpsPrevPhase !== 'result') {
            rpsRevealStart = now;
        }
        rpsPrevPhase = rpsState.phase;

        rpsDraw(rpsState, now);
        rpsState.animFrame = requestAnimationFrame(rpsRenderLoop);
    };

    const rpsCheckBothReady = () => {
        if (!isHost) return;
        if (!rpsState.hostReady || !rpsState.joinerReady) return;
        if (rpsState.phase !== 'choose') return;

        rpsState.phase = 'shake';
        rpsState.shakeStartTime = performance.now();
        if (isConnected()) dc.send("R" + JSON.stringify(rpsState));

        rpsState.restartTimer = setTimeout(() => {
            rpsState.phase = 'reveal';
            rpsState.roundWinner = rpsResolveRound(rpsState);
            if (rpsState.roundWinner !== 'draw') rpsState.scores[rpsState.roundWinner]++;

            if (rpsState.scores.host >= 3 || rpsState.scores.joiner >= 3) {
                rpsState.seriesWinner = rpsState.scores.host >= 3 ? 'host' : 'joiner';
                rpsState.phase = 'result';
            }
            if (isConnected()) dc.send("R" + JSON.stringify(rpsState));

            const nextDelay = rpsState.seriesWinner ? 1000 : 2200;
            rpsState.restartCountdown = rpsState.seriesWinner ? 3 : null;

            const nextTick = () => {
                if (rpsState.seriesWinner) {
                    rpsState.restartCountdown--;
                    if (isConnected()) dc.send("R" + JSON.stringify(rpsState));
                    if (rpsState.restartCountdown > 0) {
                        rpsState.restartTimer = setTimeout(nextTick, 1000);
                        return;
                    }
                    const fresh = rpsInitState({ host: 0, joiner: 0 });
                    rpsState = { ...fresh, animFrame: rpsState.animFrame, restartTimer: null };
                } else {
                    const fresh = rpsInitState(rpsState.scores);
                    fresh.round = rpsState.round + 1;
                    rpsState = { ...fresh, animFrame: rpsState.animFrame, restartTimer: null };
                }
                if (isConnected()) dc.send("R" + JSON.stringify(rpsState));
            };
            rpsState.restartTimer = setTimeout(nextTick, nextDelay);
        }, RPS_TOTAL_MS + 80);
    };

    const rpsPickChoice = (choice) => {
        if (currentGame !== 'rps') return;
        if (rpsState.phase !== 'choose') return;
        const myKey = isHost ? 'host' : 'joiner';
        if (rpsState[myKey + 'Ready']) return;

        rpsState[myKey + 'Choice'] = choice;
        rpsState[myKey + 'Ready'] = true;

        if (isHost) {
            rpsCheckBothReady();
            if (isConnected()) dc.send("R" + JSON.stringify(rpsState));
        } else {
            if (isConnected()) dc.send("RM" + choice);
        }
    };

    const startRPS = () => {
        currentGame = 'rps';
        leaveBtn.style.display = "flex";
        allViews().forEach(v => v.style.display = "none");
        rpsC.style.display = "block";
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        iG.style.opacity = "1"; iG.setAttribute('active', 'true');

        if (isHost) {
            rpsState = rpsInitState();
            if (isConnected()) dc.send("R" + JSON.stringify(rpsState));
        }

        if (rpsState.animFrame) cancelAnimationFrame(rpsState.animFrame);
        rpsState.animFrame = requestAnimationFrame(rpsRenderLoop);
    };

    const stopRPS = () => {
        if (rpsState.restartTimer) { clearTimeout(rpsState.restartTimer); }
        if (rpsState.animFrame) { cancelAnimationFrame(rpsState.animFrame); }
        rpsState = rpsInitState();
        rpsState.animFrame = null;
        rpsState.restartTimer = null;
        rpsRevealStart = null;
        rpsPrevPhase = null;
        rctx.fillStyle = "#0a0a0c"; rctx.fillRect(0, 0, W, H);
        if (currentGame === 'rps') { currentGame = null; leaveBtn.style.display = "none"; }
    };

    rpsC.onclick = (e) => {
        if (currentGame !== 'rps') return;
        if (rpsState.phase !== 'choose') return;
        const myKey = isHost ? 'host' : 'joiner';
        if (rpsState[myKey + 'Ready']) return;

        const rect = rpsC.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        for (const btn of RPS_BTNS) {
            const bx = btn.x - RPS_BTN_W / 2;
            const by = RPS_BTN_Y;
            if (mx >= bx && mx <= bx + RPS_BTN_W && my >= by && my <= by + RPS_BTN_H) {
                rpsPickChoice(btn.key);
                return;
            }
        }
    };

    rpsC.onmousemove = (e) => {
        if (currentGame !== 'rps') return;
        const myKey = isHost ? 'host' : 'joiner';
        if (rpsState.phase !== 'choose' || rpsState[myKey + 'Ready']) {
            rpsC.style.cursor = "default";
            return;
        }
        const rect = rpsC.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = RPS_BTNS.some(btn => {
            const bx = btn.x - RPS_BTN_W / 2;
            return mx >= bx && mx <= bx + RPS_BTN_W && my >= RPS_BTN_Y && my <= RPS_BTN_Y + RPS_BTN_H;
        });
        rpsC.style.cursor = hit ? "pointer" : "default";
    };

    // ============================================================
    //  MEMORY (SIMON SAYS)
    // ============================================================
    //
    // Two-player competitive Simon Says.
    // Host drives all logic. Protocol prefix "ME" for full state
    // sync (host → joiner), "MEB" for joiner button press.
    //
    // Rules:
    //  - Host starts by clicking START
    //  - Sequence grows by 1 each successful turn
    //  - Players alternate: if the active player successfully
    //    repeats the sequence they score 1 point, then the
    //    other player must repeat the SAME sequence (now +1 step)
    //  - Actually simpler: players alternate turns. Each turn,
    //    host adds one colour to sequence, active player must
    //    repeat whole sequence. Wrong = other player gets a point.
    //    First to MEM_WIN_SCORE wins the series.
    //  - After each wrong press, scores update and new round starts
    //    (fresh sequence of length 1, other player's turn to input)
    // ============================================================

    // Initialise memState now that memInitState is defined (declared earlier)
    memState = memInitState();

    // Draw one coloured button with optional lit/hover state
    const memDrawQuad = (q, lit, hovered) => {
        const base = MEM_COLORS[q.idx];
        const dark = MEM_DARK[q.idx];
        const s = q.startAng + MEM_GAP_ANG;
        const e = q.endAng - MEM_GAP_ANG;

        // Outer arc shape (donut slice)
        mctx.beginPath();
        mctx.arc(MEM_CENTER_X, MEM_CENTER_Y, MEM_OUTER_R, s, e);
        mctx.arc(MEM_CENTER_X, MEM_CENTER_Y, MEM_INNER_R, e, s, true);
        mctx.closePath();
        mctx.fillStyle = lit ? base : (hovered ? dark + "ee" : dark);
        mctx.fill();

        // Border
        mctx.strokeStyle = lit ? base : base + "55";
        mctx.lineWidth = lit ? 2.5 : 1.5;
        mctx.beginPath();
        mctx.arc(MEM_CENTER_X, MEM_CENTER_Y, MEM_OUTER_R, s, e);
        mctx.arc(MEM_CENTER_X, MEM_CENTER_Y, MEM_INNER_R, e, s, true);
        mctx.closePath();
        mctx.stroke();

        // Label — positioned at midpoint of the arc, between inner and outer radius
        const midAng = (s + e) / 2;
        const labelR = (MEM_INNER_R + MEM_OUTER_R) / 2;
        const lx = MEM_CENTER_X + Math.cos(midAng) * labelR;
        const ly = MEM_CENTER_Y + Math.sin(midAng) * labelR;
        mctx.font = lit ? "bold 10px 'Segoe UI'" : "9px 'Segoe UI'";
        mctx.textAlign = "center";
        mctx.textBaseline = "middle";
        mctx.fillStyle = lit ? "#fff" : base + "99";
        mctx.fillText(MEM_LABELS[q.idx], lx, ly);
    };

    const memDraw = (state, hoverBtn) => {
        mctx.fillStyle = "#0a0a0c";
        mctx.fillRect(0, 0, W, H);

        const myKey = isHost ? 'host' : 'joiner';
        const theirKey = isHost ? 'joiner' : 'host';

        // ── Scoreboard header ──────────────────────────────────
        mctx.font = "bold 12px 'Segoe UI'";
        mctx.textAlign = "left";
        mctx.fillStyle = "#ff5f1f";
        mctx.fillText(`YOU  ${state.scores[myKey]}`, 14, 22);
        mctx.textAlign = "right";
        mctx.fillStyle = "#3b82f6";
        mctx.fillText(`${state.scores[theirKey]}  ${peerName || 'PEER'}`, W - 14, 22);

        // Win pips
        const pipR = 4, pipSpacing = 16;
        const totalPips = MEM_WIN_SCORE;
        const pipStartX = W / 2 - ((totalPips - 1) * pipSpacing) / 2;
        for (let i = 0; i < totalPips; i++) {
            const px = pipStartX + i * pipSpacing;
            mctx.beginPath();
            mctx.arc(px, 20, pipR, 0, Math.PI * 2);
            if (i < state.scores[myKey]) mctx.fillStyle = "#ff5f1f";
            else if (i >= totalPips - state.scores[theirKey]) mctx.fillStyle = "#3b82f6";
            else mctx.fillStyle = "#1f1f23";
            mctx.fill();
        }

        // ── Sequence length + turn label ──────────────────────
        if (state.phase !== 'waiting' && !state.winner) {
            mctx.textAlign = "center";
            mctx.font = "bold 11px 'Segoe UI'";
            mctx.fillStyle = "#3f3f46";
            mctx.fillText(`SEQUENCE  ${state.sequence.length}`, W / 2, 40);

            let turnText = '', turnColor = '#52525b';
            if (state.phase === 'showing') {
                turnText = 'WATCH THE SEQUENCE';
                turnColor = '#ffd60a';
            } else if (state.phase === 'input') {
                const isMyTurn = state.activePlayer === myKey;
                turnText = isMyTurn ? 'YOUR TURN' : 'THEIR TURN';
                turnColor = isMyTurn ? '#ff5f1f' : '#3b82f6';
            } else if (state.phase === 'correct') {
                turnText = 'CORRECT!';
                turnColor = '#30d158';
            } else if (state.phase === 'wrong') {
                turnText = 'WRONG!';
                turnColor = '#ff3b30';
            }
            mctx.font = "bold 11px 'Segoe UI'";
            mctx.fillStyle = turnColor;
            mctx.fillText(turnText, W / 2, 54);
        }

        // ── Centre hub circle ──────────────────────────────────
        mctx.beginPath();
        mctx.arc(MEM_CENTER_X, MEM_CENTER_Y, MEM_INNER_R - 2, 0, Math.PI * 2);
        mctx.fillStyle = "#111114";
        mctx.fill();
        mctx.strokeStyle = "#27272a";
        mctx.lineWidth = 1.5;
        mctx.stroke();

        // ── 4 Simon quadrant buttons ──────────────────────────
        const isMyTurn = state.phase === 'input' && state.activePlayer === myKey;
        for (const q of MEM_QUADS) {
            const lit = (state.phase === 'showing' || state.phase === 'input') && state.litIdx === q.idx;
            const hov = isMyTurn && hoverBtn === q.idx && !lit;
            memDrawQuad(q, lit, hov);
        }

        // ── Input progress dots ────────────────────────────────
        if (state.phase === 'input' && state.sequence.length > 0) {
            const dotSpacing = Math.min(14, (W - 80) / state.sequence.length);
            const totalW = (state.sequence.length - 1) * dotSpacing;
            const startX = W / 2 - totalW / 2;
            const dotY = H - 20;
            for (let i = 0; i < state.sequence.length; i++) {
                const px = startX + i * dotSpacing;
                mctx.beginPath();
                mctx.arc(px, dotY, 3.5, 0, Math.PI * 2);
                if (i < state.inputIndex) mctx.fillStyle = MEM_COLORS[state.sequence[i]];
                else if (i === state.inputIndex) mctx.fillStyle = "#52525b";
                else mctx.fillStyle = "#1f1f23";
                mctx.fill();
            }
        }

        // ── Waiting / start prompt ─────────────────────────────
        if (state.phase === 'waiting') {
            if (isHost) {
                const bw = 120, bh = 36, bx = W / 2 - 60, by = H - 54;
                const hov = hoverBtn === 99;
                mctx.fillStyle = hov ? "#ff5f1f" : "#1a0a00";
                mctx.strokeStyle = "#ff5f1f";
                mctx.lineWidth = 1.5;
                mctx.beginPath();
                mctx.roundRect(bx, by, bw, bh, 8);
                mctx.fill();
                mctx.stroke();
                mctx.font = "bold 12px 'Segoe UI'";
                mctx.textAlign = "center";
                mctx.textBaseline = "middle";
                mctx.fillStyle = hov ? "#000" : "#ff5f1f";
                mctx.fillText("▶  START GAME", W / 2, by + bh / 2);
                mctx.textBaseline = "alphabetic";
            } else {
                mctx.font = "12px 'Segoe UI'";
                mctx.textAlign = "center";
                mctx.textBaseline = "alphabetic";
                mctx.fillStyle = "#3f3f46";
                mctx.fillText("Waiting for host to start...", W / 2, H - 38);
            }
        }

        // ── Flash feedback overlay ─────────────────────────────
        if (state.flashResult) {
            mctx.fillStyle = state.flashResult === 'good'
                ? "rgba(48,209,88,0.15)"
                : "rgba(255,59,48,0.15)";
            mctx.fillRect(0, 0, W, H);
        }

        // ── Game-over overlay ──────────────────────────────────
        if (state.winner) {
            mctx.fillStyle = "rgba(0,0,0,0.72)";
            mctx.fillRect(0, 0, W, H);
            mctx.textAlign = "center";
            mctx.textBaseline = "alphabetic";
            const isIWinner = state.winner === myKey;
            mctx.font = "bold 40px 'Segoe UI'";
            mctx.fillStyle = isIWinner ? "#ff5f1f" : "#3b82f6";
            mctx.fillText(isIWinner ? "YOU WIN!" : "YOU LOSE!", W / 2, H / 2 - 12);
            mctx.font = "13px 'Segoe UI'";
            mctx.fillStyle = "#52525b";
            mctx.fillText(`${state.scores[myKey]} — ${state.scores[theirKey]}`, W / 2, H / 2 + 18);
            if (state.restartCountdown && state.restartCountdown > 0) {
                mctx.fillText(`New game in ${state.restartCountdown}...`, W / 2, H / 2 + 42);
            }
        }
    };

    const memRenderLoop = () => {
        memDraw(memState, memHoverBtn);
        memAnimFrame = requestAnimationFrame(memRenderLoop);
    };

    // Host: show the current sequence step by step, then flip to input
    const memShowSequence = () => {
        if (!isHost) return;
        memState.phase = 'showing';
        memState.litIdx = -1;
        memState.showStep = 0;
        if (isConnected()) dc.send("ME" + JSON.stringify(memState));

        const doStep = () => {
            if (currentGame !== 'memory') return;
            const step = memState.showStep;
            if (step >= memState.sequence.length) {
                // All steps shown — now player inputs
                memState.litIdx = -1;
                memState.phase = 'input';
                memState.inputIndex = 0;
                if (isConnected()) dc.send("ME" + JSON.stringify(memState));
                return;
            }
            // Light up tile
            memState.litIdx = memState.sequence[step];
            if (isConnected()) dc.send("ME" + JSON.stringify(memState));

            memShowTimer = setTimeout(() => {
                // Turn off tile
                memState.litIdx = -1;
                memState.showStep++;
                if (isConnected()) dc.send("ME" + JSON.stringify(memState));
                memShowTimer = setTimeout(doStep, MEM_GAP_MS);
            }, MEM_SHOW_MS);
        };

        // Small lead-in pause
        memShowTimer = setTimeout(doStep, 500);
    };

    // Host: start or continue — add one step and show sequence
    const memNextRound = () => {
        if (!isHost) return;
        const nextColor = Math.floor(Math.random() * 4);
        memState.sequence.push(nextColor);
        memShowSequence();
    };

    // Host: a button was pressed (either directly or via joiner message)
    const memHandlePress = (btnIdx) => {
        if (!isHost) return;
        if (memState.phase !== 'input') return;
        const myKey = isHost ? 'host' : 'joiner';

        // Flash the tile briefly
        memState.litIdx = btnIdx;
        if (isConnected()) dc.send("ME" + JSON.stringify(memState));

        memShowTimer = setTimeout(() => {
            if (currentGame !== 'memory') return;
            memState.litIdx = -1;

            const expected = memState.sequence[memState.inputIndex];

            if (btnIdx === expected) {
                // Correct press
                memState.inputIndex++;
                if (memState.inputIndex >= memState.sequence.length) {
                    // Completed whole sequence!
                    memState.flashResult = 'good';
                    memState.phase = 'correct';
                    if (isConnected()) dc.send("ME" + JSON.stringify(memState));

                    memShowTimer = setTimeout(() => {
                        if (currentGame !== 'memory') return;
                        memState.flashResult = null;
                        // Switch active player
                        memState.activePlayer = memState.activePlayer === 'host' ? 'joiner' : 'host';
                        memNextRound();
                    }, 700);
                } else {
                    // More steps to go
                    if (isConnected()) dc.send("ME" + JSON.stringify(memState));
                }
            } else {
                // Wrong press — other player scores
                memState.flashResult = 'bad';
                memState.phase = 'wrong';
                const scorer = memState.activePlayer === 'host' ? 'joiner' : 'host';
                memState.scores[scorer]++;

                if (memState.scores[scorer] >= MEM_WIN_SCORE) {
                    memState.winner = scorer;
                    if (isConnected()) dc.send("ME" + JSON.stringify(memState));
                    memTriggerRestart();
                } else {
                    if (isConnected()) dc.send("ME" + JSON.stringify(memState));
                    memShowTimer = setTimeout(() => {
                        if (currentGame !== 'memory') return;
                        memState.flashResult = null;
                        // Scorer gets to go next, fresh sequence
                        memState.activePlayer = scorer;
                        memState.sequence = [];
                        memNextRound();
                    }, 900);
                }
            }
        }, 140);
    };

    const memTriggerRestart = () => {
        if (memRestartTimer) return;
        memState.restartCountdown = 3;
        if (isConnected()) dc.send("ME" + JSON.stringify(memState));
        const tick = () => {
            if (currentGame !== 'memory') return;
            memState.restartCountdown--;
            if (isConnected()) dc.send("ME" + JSON.stringify(memState));
            if (memState.restartCountdown <= 0) {
                memRestartTimer = null;
                const fresh = memInitState({ host: 0, joiner: 0 });
                memState = fresh;
                if (isConnected()) dc.send("ME" + JSON.stringify(memState));
            } else {
                memRestartTimer = setTimeout(tick, 1000);
            }
        };
        memRestartTimer = setTimeout(tick, 1000);
    };

    const startMemory = () => {
        currentGame = 'memory';
        leaveBtn.style.display = "flex";
        allViews().forEach(v => v.style.display = "none");
        memC.style.display = "block";
        allIcons().forEach(i => { i.style.opacity = "0.4"; i.setAttribute('active', 'false'); });
        iG.style.opacity = "1"; iG.setAttribute('active', 'true');

        if (isHost) {
            memState = memInitState();
            if (isConnected()) dc.send("ME" + JSON.stringify(memState));
        }

        if (memAnimFrame) cancelAnimationFrame(memAnimFrame);
        memAnimFrame = requestAnimationFrame(memRenderLoop);
    };

    const stopMemory = () => {
        if (memShowTimer) { clearTimeout(memShowTimer); memShowTimer = null; }
        if (memRestartTimer) { clearTimeout(memRestartTimer); memRestartTimer = null; }
        if (memAnimFrame) { cancelAnimationFrame(memAnimFrame); memAnimFrame = null; }
        memState = memInitState();
        memHoverBtn = -1;
        mctx.fillStyle = "#0a0a0c"; mctx.fillRect(0, 0, W, H);
        if (currentGame === 'memory') { currentGame = null; leaveBtn.style.display = "none"; }
    };

    // Click handler for Memory canvas
    memC.onclick = (e) => {
        if (currentGame !== 'memory') return;

        const rect = memC.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const myKey = isHost ? 'host' : 'joiner';

        // START button (host only, waiting phase)
        if (memState.phase === 'waiting' && isHost) {
            const bw = 120, bh = 36, bx = W / 2 - 60, by = H - 54;
            if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
                memState.activePlayer = 'host';
                memNextRound();
                return;
            }
        }

        // Check colour buttons during input phase (only active player)
        if (memState.phase === 'input' && memState.activePlayer === myKey) {
            for (const q of MEM_QUADS) {
                if (memQuadHit(q, mx, my)) {
                    const i = q.idx;
                    if (isHost) {
                        memHandlePress(i);
                    } else {
                        if (isConnected()) dc.send("MEB" + i);
                    }
                    return;
                }
            }
        }
    };

    memC.onmousemove = (e) => {
        if (currentGame !== 'memory') return;
        const rect = memC.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const myKey = isHost ? 'host' : 'joiner';

        let hit = -1;

        // Check START button
        if (memState.phase === 'waiting' && isHost) {
            const bw = 120, bh = 36, bx = W / 2 - 60, by = H - 54;
            if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
                hit = 99;
            }
        }

        // Check colour buttons
        if (memState.phase === 'input' && memState.activePlayer === myKey) {
            for (const q of MEM_QUADS) {
                if (memQuadHit(q, mx, my)) {
                    hit = q.idx;
                    break;
                }
            }
        }

        memHoverBtn = hit;
        memC.style.cursor = hit >= 0 ? "pointer" : "default";
    };

    memC.onmouseleave = () => {
        memHoverBtn = -1;
        if (currentGame === 'memory') memC.style.cursor = "default";
    };

    // ============================================================
    //  DATA CHANNEL
    // ============================================================

    const setupDC = (channel) => {
        dc = channel;
        dc.onopen = () => {
            dot.style.background = "#ff5f1f";
            dot.style.boxShadow = "0 0 10px #ff5f1f";
            dc.send("N" + userName);
            setTab(gameV, iG);
        };
        dc.onmessage = (e) => {
            const raw = e.data;
            const t = raw[0];
            const d = raw.slice(1);

            if (raw.startsWith("GINVITE:")) {
                const parts = raw.slice(8).split(":");
                const gameName = parts[0];
                const senderName = parts.slice(1).join(":");
                const prettyName = gameName === "pong" ? "Ping Pong"
                    : gameName === "snake" ? "Snake"
                        : gameName === "ttt" ? "Tic Tac Toe"
                            : gameName === "c4" ? "Connect 4"
                                : gameName === "rps" ? "Rock Paper Scissors"
                                    : gameName === "memory" ? "Memory"
                                        : gameName;
                showToast(senderName, prettyName,
                    () => {
                        dc.send("GINVITE_ACCEPT:" + gameName);
                        if (gameName === "pong") startPong();
                        else if (gameName === "snake") startSnake();
                        else if (gameName === "ttt") startTTT();
                        else if (gameName === "c4") startC4();
                        else if (gameName === "rps") startRPS();
                        else if (gameName === "memory") startMemory();
                    },
                    () => { dc.send("GINVITE_DECLINE:" + gameName); }
                );
                return;
            }
            if (raw.startsWith("GINVITE_ACCEPT:")) {
                const gameName = raw.slice(15);
                allViews().forEach(v => v.style.display = "none");
                if (gameName === "pong") startPong();
                else if (gameName === "snake") startSnake();
                else if (gameName === "ttt") startTTT();
                else if (gameName === "c4") startC4();
                else if (gameName === "rps") startRPS();
                else if (gameName === "memory") startMemory();
                return;
            }
            if (raw.startsWith("GINVITE_DECLINE:")) {
                setTab(gameV, iG);
                showInfo((peerName || "They") + " declined your invite.");
                return;
            }
            if (raw === "GINVITE_CANCEL") { hideToast(); return; }
            if (raw.startsWith("GLEAVE")) {
                if (currentGame === 'pong') stopPong();
                if (currentGame === 'snake') stopSnake();
                if (currentGame === 'ttt') stopTTT();
                if (currentGame === 'c4') stopC4();
                if (currentGame === 'rps') stopRPS();
                if (currentGame === 'memory') stopMemory();
                setTab(gameV, iG);
                showInfo((peerName || "Other player") + " left the game.");
                return;
            }

            // Pong
            if (t === "G") {
                const s = JSON.parse(d);
                pongState.ball = s.b; pongState.scoreL = s.sL; pongState.scoreR = s.sR; pongState.countdown = s.cd;
                if (!isHost) pongState.pL = s.pL;
            }
            if (t === "P") { pongState.pR = parseInt(d); }

            // Snake
            if (t === "S") {
                if (!isHost) {
                    const incoming = JSON.parse(d);
                    const savedDir = snakeState.snakes && snakeState.snakes.joiner
                        ? snakeState.snakes.joiner.nextDir : null;
                    const localFrame = snakeState.animFrame;
                    snakeState = incoming;
                    snakeState.animFrame = localFrame;
                    if (savedDir && snakeState.snakes.joiner) snakeState.snakes.joiner.nextDir = savedDir;
                }
            }
            if (t === "K") {
                if (isHost && snakeState.snakes && snakeState.snakes.joiner) {
                    snakeState.snakes.joiner.nextDir = JSON.parse(d);
                }
            }

            // Tic Tac Toe
            if (t === "T" && d[0] !== "M") {
                if (!isHost) {
                    tttState = JSON.parse(d);
                    tttWinProgress = tttState.winLine ? tttWinProgress : 0;
                }
            }
            if (raw.startsWith("TM")) {
                if (isHost) {
                    const idx = parseInt(raw.slice(2));
                    if (tttState.turn === 'O' && tttState.board[idx] === null && !tttState.winner) {
                        tttPlaceMark(idx);
                    }
                }
            }

            // Connect 4
            if (t === "F" && d[0] !== "M") {
                if (!isHost) {
                    const incoming = JSON.parse(d);
                    const prevWinCells = c4State.winCells;
                    c4State = incoming;
                    if (!incoming.winCells) c4WinProgress = 0;
                    else if (!prevWinCells) c4WinProgress = 0;
                }
            }
            if (raw.startsWith("FM")) {
                if (isHost) {
                    const col = parseInt(raw.slice(2));
                    if (c4State.turn === 'Y' && !c4State.winner) {
                        c4PlacePiece(col);
                    }
                }
            }

            // Rock Paper Scissors
            if (t === "R" && d[0] !== "M") {
                if (!isHost) {
                    const incoming = JSON.parse(d);
                    const localFrame = rpsState.animFrame;
                    const prevPhase = rpsState.phase;
                    const prevShakeStart = rpsState.shakeStartTime;
                    rpsState = incoming;
                    rpsState.animFrame = localFrame;
                    rpsState.restartTimer = null;
                    if (incoming.phase === 'shake') {
                        rpsState.shakeStartTime = prevPhase === 'shake' ? prevShakeStart : performance.now();
                    }
                    if ((incoming.phase === 'reveal' || incoming.phase === 'result') && prevPhase === 'shake') {
                        rpsRevealStart = performance.now();
                    }
                }
            }
            if (raw.startsWith("RM")) {
                if (isHost) {
                    const choice = raw.slice(2);
                    if (rpsState.phase === 'choose' && !rpsState.joinerReady) {
                        rpsState.joinerChoice = choice;
                        rpsState.joinerReady = true;
                        rpsCheckBothReady();
                        if (isConnected()) dc.send("R" + JSON.stringify(rpsState));
                    }
                }
            }

            // Memory — full state from host
            if (raw.startsWith("ME") && !raw.startsWith("MEB")) {
                if (!isHost) {
                    const incoming = JSON.parse(raw.slice(2));
                    const localFrame = memAnimFrame;
                    memState = incoming;
                    memAnimFrame = localFrame;
                }
            }
            // Joiner's button press → host
            if (raw.startsWith("MEB")) {
                if (isHost) {
                    const btnIdx = parseInt(raw.slice(3));
                    if (memState.phase === 'input' && memState.activePlayer === 'joiner') {
                        memHandlePress(btnIdx);
                    }
                }
            }

            // Meta
            if (t === "C") { const j = JSON.parse(d); log(j.m, j.n, false); }
            if (t === "N") { peerName = d; connName.textContent = peerName; }
            if (t === "D") { resetAll(); }
        };
        dc.onclose = () => { if (dc) resetAll(); };
    };

    // ============================================================
    //  GAME TILE CLICKS
    // ============================================================

    pongTile.onclick = () => {
        if (!isConnected()) return;
        waitSub.textContent = "Invite sent to " + (peerName || "peer");
        allViews().forEach(v => v.style.display = "none");
        waitV.style.display = "flex";
        leaveBtn.style.display = "none";
        dc.send("GINVITE:pong:" + userName);
    };

    snakeTile.onclick = () => {
        if (!isConnected()) return;
        waitSub.textContent = "Invite sent to " + (peerName || "peer");
        allViews().forEach(v => v.style.display = "none");
        waitV.style.display = "flex";
        leaveBtn.style.display = "none";
        dc.send("GINVITE:snake:" + userName);
    };

    tttTile.onclick = () => {
        if (!isConnected()) return;
        waitSub.textContent = "Invite sent to " + (peerName || "peer");
        allViews().forEach(v => v.style.display = "none");
        waitV.style.display = "flex";
        leaveBtn.style.display = "none";
        dc.send("GINVITE:ttt:" + userName);
    };

    c4Tile.onclick = () => {
        if (!isConnected()) return;
        waitSub.textContent = "Invite sent to " + (peerName || "peer");
        allViews().forEach(v => v.style.display = "none");
        waitV.style.display = "flex";
        leaveBtn.style.display = "none";
        dc.send("GINVITE:c4:" + userName);
    };

    rpsTile.onclick = () => {
        if (!isConnected()) return;
        waitSub.textContent = "Invite sent to " + (peerName || "peer");
        allViews().forEach(v => v.style.display = "none");
        waitV.style.display = "flex";
        leaveBtn.style.display = "none";
        dc.send("GINVITE:rps:" + userName);
    };

    memTile.onclick = () => {
        if (!isConnected()) return;
        waitSub.textContent = "Invite sent to " + (peerName || "peer");
        allViews().forEach(v => v.style.display = "none");
        waitV.style.display = "flex";
        leaveBtn.style.display = "none";
        dc.send("GINVITE:memory:" + userName);
    };

    // ============================================================
    //  KEYBOARD INPUT
    // ============================================================

    window.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            const isHidden = ui.style.display === "none";
            ui.style.display = isHidden ? "flex" : "none";
            if (!isHidden) {
                hideToast();
                const info = document.getElementById('eclipse-info');
                if (info) info.remove();
            }
            return;
        }

        if (currentGame === 'snake' && snakeState.started) {
            const dir = snakeKeyMap[e.key];
            if (!dir) return;
            e.preventDefault();
            const myKey = isHost ? 'host' : 'joiner';
            const snake = snakeState.snakes[myKey];
            if (!snake || !snake.alive) return;
            if (dir.x === -snake.dir.x && dir.y === -snake.dir.y) return;
            snake.nextDir = dir;
            if (!isHost && isConnected()) dc.send("K" + JSON.stringify(dir));
        }

        if (currentGame === 'rps' && rpsState.phase === 'choose') {
            const keyMap = { 'r': 'R', 'p': 'P', 's': 'S', 'R': 'R', 'P': 'P', 'S': 'S' };
            const choice = keyMap[e.key];
            if (choice) {
                e.preventDefault();
                rpsPickChoice(choice);
            }
        }

        // Memory keyboard shortcuts: 1/Q=Red, 2/W=Green, 3/A=Blue, 4/S=Yellow
        if (currentGame === 'memory') {
            const myKey = isHost ? 'host' : 'joiner';
            if (memState.phase === 'input' && memState.activePlayer === myKey) {
                const memKeyMap = { '1': 0, 'q': 0, 'Q': 0, '2': 1, 'w': 1, 'W': 1, '3': 2, 'a': 2, 'A': 2, '4': 3, 's': 3, 'S': 3 };
                const btnIdx = memKeyMap[e.key];
                if (btnIdx !== undefined) {
                    e.preventDefault();
                    if (isHost) {
                        memHandlePress(btnIdx);
                    } else {
                        if (isConnected()) dc.send("MEB" + btnIdx);
                    }
                }
            }
            if (memState.phase === 'waiting' && isHost && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                memState.activePlayer = 'host';
                memNextRound();
            }
        }
    });

    // ============================================================
    //  CONNECTION SETUP
    // ============================================================

    bO.onclick = async () => {
        isHost = true;
        userName = nameInp.value.trim() || userName;
        setupDC(pc.createDataChannel("game"));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        pc.onicecandidate = (e) => {
            if (!e.candidate) {
                navigator.clipboard.writeText(JSON.stringify(pc.localDescription));
                statusBox.textContent = "OFFER COPIED. GIVE TO JOINER.";
            }
        };
        const bPaste = document.createElement('button');
        bPaste.className = "paste-btn";
        bPaste.textContent = "PASTE JOINER ANSWER";
        bPaste.style.cssText = bStyle + "background:#1f1f23; color:#a1a1aa; margin-top:4px;";
        bPaste.onclick = async () => {
            const raw = prompt("PASTE JOINER ANSWER:");
            if (!raw) return;
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(raw)));
                statusBox.textContent = "CONNECTING...";
                bPaste.remove();
            } catch (err) { statusBox.textContent = "INVALID ANSWER. TRY AGAIN."; }
        };
        btnRow.after(bPaste);
    };

    bJ.onclick = async () => {
        userName = nameInp.value.trim() || userName;
        const raw = prompt("PASTE HOST KEY:");
        if (!raw) return;
        const json = JSON.parse(raw);
        await pc.setRemoteDescription(new RTCSessionDescription(json));
        if (json.type === "offer") {
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            pc.onicecandidate = (e) => {
                if (!e.candidate) {
                    navigator.clipboard.writeText(JSON.stringify(pc.localDescription));
                    statusBox.textContent = "ANSWER COPIED. GIVE TO HOST.";
                }
            };
        }
    };

    pc.ondatachannel = (e) => setupDC(e.channel);

    // ============================================================
    //  SIDEBAR ICON CLICKS
    // ============================================================

    iG.onclick = () => {
        if (currentGame !== null) return;
        setTab(isConnected() ? gameV : lockedV, iG);
    };
    iC.onclick = () => {
        const inGame = currentGame !== null;
        if (inGame) {
            const chatVisible = chatV.style.display === "flex";
            if (chatVisible) {
                chatV.style.display = "none";
                iC.style.opacity = "0.4"; iC.setAttribute('active', 'false');
                iG.style.opacity = "1"; iG.setAttribute('active', 'true');
            } else {
                chatV.style.display = "flex";
                iC.style.opacity = "1"; iC.setAttribute('active', 'true');
                iG.style.opacity = "0.4"; iG.setAttribute('active', 'false');
                unreadCount = 0; badge.style.display = "none";
            }
        } else {
            setTab(chatV, iC);
        }
    };
    iS.onclick = () => setTab(setV, iS);

    // ============================================================
    //  DRAGGING
    // ============================================================

    let isDragging = false, offset = [0, 0];
    header.onmousedown = (e) => { isDragging = true; offset = [ui.offsetLeft - e.clientX, ui.offsetTop - e.clientY]; };
    document.onmousemove = (e) => { if (isDragging) { ui.style.left = (e.clientX + offset[0]) + "px"; ui.style.top = (e.clientY + offset[1]) + "px"; } };
    document.onmouseup = () => isDragging = false;

    // ============================================================
    //  BOOT
    // ============================================================

    setTab(setV, iS);

})();
