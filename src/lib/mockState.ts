/**
 * 铁道车辆智能调度与监控系统 — 多维因素动态优先级引擎 V4.0
 *
 * 五维评分因素:
 *   1. 气象环境 (WeatherScore)       — 天气恶劣度影响车速
 *   2. 线路状况 (TrackScore)         — 异物/施工影响通行
 *   3. 运行状态 (PunctualityScore)   — 晚点程度影响让行决策
 *   4. 路网衔接 (ConnectivityScore)   — 换乘接续任务加急
 *   5. 经济效益 (RevenueScore)       — 客流上座率影响收益权重
 */

// ─────────────────── Types ───────────────────

export type WeatherType = '晴' | '大雨' | '大风' | '雪' | '雾';
export type TrackCondition = 'normal' | 'obstacle' | 'construction';

export interface Route {
  id: string;
  origin: string;
  destination: string;
  distance: number;
  weather: WeatherType;
  trackCondition: TrackCondition;
}

export interface Train {
  id: string;
  routeId: string;
  routeName: string;
  trainType: 'G' | 'D' | 'K' | 'C';
  designSpeed: number;
  speed: number;
  position: number;
  passengers: number;
  capacity: number;
  loadRate: number;
  priority: number;
  prevPriority: number;
  priorityChanged: boolean;
  priorityReason: string;
  weatherScore: number;
  trackScore: number;
  punctualityScore: number;
  connectivityScore: number;
  revenueScore: number;
  totalScore: number;
  weather: WeatherType;
  weatherIcon: string;
  trackCondition: TrackCondition;
  isDelayed: boolean;
  delayMinutes: number;
  hasTransferTask: boolean;
  affectsFollowing: boolean;
  status: 'normal' | 'delayed' | 'warning' | 'stopped';
  voltage: number;
  brakingDist: number;
  eta: number;
  friction: number;
  timestamp: string;
}

export interface SystemHistory {
  tick: number;
  avgSpeed: number;
  passengers: number;
  priorityChanges: number;
}

export interface Alert {
  id: number;
  time: string;
  message: string;
  level: 'info' | 'warning' | 'danger' | 'success';
}

export interface SystemState {
  routes: Route[];
  trains: Train[];
  isPeakHours: boolean;
  alerts: Alert[];
  history: SystemHistory[];
  stats: {
    totalPassengers: number;
    maxSpeed: number;
    avgSpeed: number;
    weatherWarnings: number;
    onTimeRate: number;
    trackIssues: number;
    priorityChanges: number;
  };
  tickCount: number;
}

// ─────────────────── Constants ───────────────────

const WEATHER_CFG: Record<WeatherType, { ratio: number; icon: string; score: number }> = {
  '晴':   { ratio: 1.00, icon: '☀️', score: 100 },
  '大雨': { ratio: 0.70, icon: '⛈️', score: 35 },
  '大风': { ratio: 0.65, icon: '🌪️', score: 30 },
  '雪':   { ratio: 0.60, icon: '❄️', score: 25 },
  '雾':   { ratio: 0.75, icon: '🌫️', score: 45 },
};

const TRACK_CFG: Record<TrackCondition, { factor: number; score: number; label: string }> = {
  normal:       { factor: 1.0, score: 100, label: '畅通' },
  construction: { factor: 0.0, score: 35,  label: '施工停运' },
  obstacle:     { factor: 0.0, score: 10,  label: '异物停运' },
};

// ─────────────────── Route & Train Definitions ───────────────────

const INITIAL_ROUTES: Route[] = [
  { id: 'R1', origin: '牡丹江',   destination: '哈尔滨西', distance: 380, weather: '晴', trackCondition: 'normal' },
  { id: 'R2', origin: '北京',     destination: '哈尔滨西', distance: 1240, weather: '晴', trackCondition: 'normal' },
  { id: 'R3', origin: '长春',     destination: '哈尔滨西', distance: 240, weather: '晴', trackCondition: 'normal' },
  { id: 'R4', origin: '齐齐哈尔', destination: '哈尔滨',   distance: 359, weather: '晴', trackCondition: 'normal' },
  { id: 'R5', origin: '佳木斯',   destination: '哈尔滨',   distance: 510, weather: '晴', trackCondition: 'normal' },
];

interface TrainDef {
  id: string; routeId: string; type: 'G' | 'D' | 'K' | 'C'; designSpeed: number; capacity: number;
  initPositionRatio: number; initLoadRatio: number;
}

const TRAIN_DEFS: TrainDef[] = [
  { id: 'D536',  routeId: 'R1', type: 'D', designSpeed: 200, capacity: 800,  initPositionRatio: 0.25, initLoadRatio: 0.20 }, // P3 target
  { id: 'G101',  routeId: 'R2', type: 'G', designSpeed: 300, capacity: 1200, initPositionRatio: 0.50, initLoadRatio: 0.95 }, // P1 target
  { id: 'D551',  routeId: 'R3', type: 'G', designSpeed: 250, capacity: 800,  initPositionRatio: 0.40, initLoadRatio: 0.65 }, // P2 target (user noted "g p2")
  { id: 'D6916', routeId: 'R4', type: 'D', designSpeed: 200, capacity: 800,  initPositionRatio: 0.60, initLoadRatio: 0.65 }, // P2 target
  { id: 'C102',  routeId: 'R5', type: 'C', designSpeed: 200, capacity: 600,  initPositionRatio: 0.30, initLoadRatio: 0.20 }, // P3 target
];

// ─────────────────── Mutable State ───────────────────

interface TrainState { position: number; passengers: number; delayMinutes: number; hasTransferTask: boolean; }

let routes: Route[] = JSON.parse(JSON.stringify(INITIAL_ROUTES));
const trainStates = new Map<string, TrainState>();
let alertIdSeq = 0;
let alertBuffer: Alert[] = [];
let tickCount = 0;
let sysHistory: SystemHistory[] = [];
let forcePeak: boolean | null = null;
const prevPriorities = new Map<string, number>();

// Init
TRAIN_DEFS.forEach(td => {
  const r = routes.find(x => x.id === td.routeId)!;
  trainStates.set(td.id, {
    position: r.distance * td.initPositionRatio,
    passengers: Math.round(td.capacity * td.initLoadRatio),
    delayMinutes: 0,
    hasTransferTask: false,
  });
});

// ─────────────────── Helpers ───────────────────

function rf(min: number, max: number) { return Math.random() * (max - min) + min; }

function timeStr(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function isNowPeak(): boolean {
  const h = new Date().getHours();
  return (h >= 7 && h < 9) || (h >= 17 && h < 19);
}

function addAlert(level: Alert['level'], msg: string) {
  alertBuffer.push({ id: ++alertIdSeq, time: timeStr(), message: msg, level });
  if (alertBuffer.length > 30) alertBuffer = alertBuffer.slice(-30);
}

// ─────────────────── Core Tick ───────────────────

const SIM_MIN_PER_TICK = 5; // 1 tick = 5 simulated minutes

export function tick(): SystemState {
  tickCount++;
  const peak = forcePeak !== null ? forcePeak : isNowPeak();
  let priorityChanges = 0;

  // — Build train snapshots —
  const trains: Train[] = TRAIN_DEFS.map(td => {
    const route = routes.find(r => r.id === td.routeId)!;
    const st = trainStates.get(td.id)!;
    const wCfg = WEATHER_CFG[route.weather];
    const tCfg = TRACK_CFG[route.trackCondition];

    // Speed
    let speed = Math.round(td.designSpeed * wCfg.ratio * tCfg.factor * rf(0.95, 1.05));
    speed = Math.max(0, Math.min(td.designSpeed, speed));

    // Advance position
    st.position += (speed * SIM_MIN_PER_TICK) / 60;
    if (st.position >= route.distance) {
      st.position = 0;
      st.delayMinutes = 0;
      addAlert('success', `[到站] ${td.id} 抵达${route.destination}站，折返${route.origin}重新发车`);
    }

    // Delay accumulation
    if (speed < td.designSpeed * 0.8) {
      st.delayMinutes += Math.round(((td.designSpeed - speed) / td.designSpeed) * SIM_MIN_PER_TICK);
    } else if (st.delayMinutes > 0) {
      st.delayMinutes = Math.max(0, st.delayMinutes - 1);
    }

    // Passenger fluctuation
    if (peak && Math.random() < 0.3) st.passengers = Math.min(td.capacity, st.passengers + Math.round(Math.random() * 40));
    if (!peak && Math.random() < 0.2) st.passengers = Math.max(50, st.passengers - Math.round(Math.random() * 30));
    const loadRate = Math.round((st.passengers / td.capacity) * 100);

    // Status
    let status: Train['status'] = 'normal';
    if (route.trackCondition === 'obstacle' || route.trackCondition === 'construction') status = 'stopped';
    else if (route.weather === '大雨' || route.weather === '大风' || route.weather === '雪') status = 'warning';
    else if (st.delayMinutes > 5) status = 'delayed';

    const affectsFollowing = st.delayMinutes > 10;
    const remaining = route.distance - st.position;
    const eta = speed > 0 ? Math.round((remaining / speed) * 60) : 999;

    // ——— Five-Factor Scoring ———
    const weatherScore = wCfg.score;
    const trackScore = tCfg.score;

    let punctualityScore = 100;
    if (st.delayMinutes > 15) punctualityScore = 15;
    else if (st.delayMinutes > 5) punctualityScore = 40;
    else if (st.delayMinutes > 0) punctualityScore = 70;
    if (affectsFollowing) punctualityScore = Math.max(5, punctualityScore - 20);

    const connectivityScore = st.hasTransferTask ? 100 : 50;

    let revenueScore = 50;
    if (loadRate >= 90) revenueScore = 100;
    else if (loadRate >= 70) revenueScore = 80;
    else if (loadRate >= 40) revenueScore = 55;
    else if (loadRate >= 20) revenueScore = 30;
    else revenueScore = 15;

    // Weighted total (peak → revenue weight rises)
    const W = peak
      ? { w: 0.18, t: 0.22, p: 0.18, c: 0.15, r: 0.27 }
      : { w: 0.20, t: 0.25, p: 0.20, c: 0.15, r: 0.20 };
    const totalScore = Number((weatherScore * W.w + trackScore * W.t + punctualityScore * W.p + connectivityScore * W.c + revenueScore * W.r).toFixed(1));

    const friction = route.weather === '雪' ? rf(0.55, 0.65) : route.weather === '大雨' ? rf(0.65, 0.75) : route.weather === '雾' ? rf(0.75, 0.82) : rf(0.85, 0.95);

    return {
      id: td.id, routeId: td.routeId,
      routeName: `${route.origin}→${route.destination}`,
      trainType: td.type, designSpeed: td.designSpeed,
      speed, position: st.position,
      passengers: st.passengers, capacity: td.capacity, loadRate,
      priority: 0, prevPriority: prevPriorities.get(td.id) || 0,
      priorityChanged: false, priorityReason: '',
      weatherScore, trackScore, punctualityScore, connectivityScore, revenueScore, totalScore,
      weather: route.weather, weatherIcon: wCfg.icon,
      trackCondition: route.trackCondition,
      isDelayed: st.delayMinutes > 0, delayMinutes: st.delayMinutes,
      hasTransferTask: st.hasTransferTask, affectsFollowing, status,
      voltage: Number(rf(24.5, 27.5).toFixed(1)),
      brakingDist: Math.round((speed * speed) / 100),
      eta, friction: Number(friction.toFixed(2)),
      timestamp: timeStr(),
    };
  });

  // ——— Assign Priority by absolute totalScore thresholds ———
  const sorted = [...trains].sort((a, b) => b.totalScore - a.totalScore);
  
  // Use absolute thresholds so the distribution pie chart dynamically changes
  // In a perfect weather/track scenario, the base score is 65.
  // We fine-tune thresholds so high revenue pushes to P1, mid pushes to P2, low stays P3.
  trains.forEach(t => {
    if (t.totalScore >= 88) t.priority = 1;
    else if (t.totalScore >= 80) t.priority = 2;
    else t.priority = 3;
  });
  
  // Maintain mapping for previous priority checks
  const pMap = new Map(trains.map(t => [t.id, t.priority]));
  trains.forEach(t => { 
    t.priority = pMap.get(t.id) || t.priority; 
    
    // P4 exclusive for severe downgrades
    if (t.trackCondition === 'obstacle' || t.trackCondition === 'construction' || t.weatherScore < 40) {
      t.priority = 4;
    }
  });

  // ——— Derive priority reason ———
  trains.forEach(t => {
    if (t.priority <= 2) {
      if (t.hasTransferTask) t.priorityReason = '紧急换乘接续任务保障';
      else if (t.revenueScore >= 80 && peak) t.priorityReason = '高峰高收益列车保障';
      else if (t.weatherScore >= 80 && t.trackScore >= 80) t.priorityReason = '路况良好，优先放行';
      else t.priorityReason = '综合评分优秀';
    } else {
      if (t.trackCondition === 'obstacle') t.priorityReason = '前方异物侵限，强制停车等待';
      else if (t.trackCondition === 'construction') t.priorityReason = '施工限速区间，被动降级';
      else if (t.weatherScore < 40) t.priorityReason = '恶劣天气限速，被动降级让行';
      else if (t.delayMinutes > 10) t.priorityReason = '严重晚点，让行正点列车';
      else if (t.loadRate < 30 && peak) t.priorityReason = '低客流，让行高收益列车';
      else t.priorityReason = '综合评分较低';
    }

    // Detect change
    if (t.prevPriority > 0 && t.prevPriority !== t.priority) {
      t.priorityChanged = true;
      priorityChanges++;
      const dir = t.priority < t.prevPriority ? '提升' : '下降';
      addAlert(t.priority < t.prevPriority ? 'success' : 'warning',
        `[调度变更] ${t.id} (${t.routeName}) P${t.prevPriority}→P${t.priority} ${dir}｜${t.priorityReason}`);
    }
    prevPriorities.set(t.id, t.priority);
  });

  // Sort final
  trains.sort((a, b) => a.priority - b.priority || b.totalScore - a.totalScore);

  // Stats
  const totalPassengers = trains.reduce((s, t) => s + t.passengers, 0);
  const maxSpeed = Math.max(...trains.map(t => t.speed));
  const avgSpeed = trains.reduce((s, t) => s + t.speed, 0) / trains.length;
  const weatherWarnings = trains.filter(t => t.weather !== '晴').length;
  const normalCount = trains.filter(t => t.status === 'normal').length;
  const onTimeRate = Math.round((normalCount / trains.length) * 100);
  const trackIssues = routes.filter(r => r.trackCondition !== 'normal').length;

  sysHistory.push({ tick: tickCount, avgSpeed: Number(avgSpeed.toFixed(0)), passengers: totalPassengers, priorityChanges });
  if (sysHistory.length > 30) sysHistory.shift();

  return {
    routes: routes.map(r => ({ ...r })),
    trains, isPeakHours: peak,
    alerts: [...alertBuffer], history: [...sysHistory],
    stats: { totalPassengers, maxSpeed, avgSpeed, weatherWarnings, onTimeRate, trackIssues, priorityChanges },
    tickCount,
  };
}

// ─────────────────── Public API ───────────────────

export function setRouteWeather(routeId: string, weather: WeatherType) {
  const r = routes.find(x => x.id === routeId);
  if (!r) return;
  const old = r.weather;
  r.weather = weather;
  addAlert('danger', `[气象预警] ${r.origin}→${r.destination} 天气: ${old}→${weather} ${WEATHER_CFG[weather].icon}  速度系数 ${WEATHER_CFG[weather].ratio}`);
}

export function setRouteTrack(routeId: string, cond: TrackCondition) {
  const r = routes.find(x => x.id === routeId);
  if (!r) return;
  r.trackCondition = cond;
  if (cond === 'normal') addAlert('success', `[线路恢复] ${r.origin}→${r.destination} 已恢复正常通行`);
  else addAlert('danger', `[线路警告] ${r.origin}→${r.destination} ${TRACK_CFG[cond].label}！通行系数 ${TRACK_CFG[cond].factor}`);
}

export function setTrainTransfer(trainId: string, on: boolean) {
  const st = trainStates.get(trainId);
  if (!st) return;
  st.hasTransferTask = on;
  addAlert(on ? 'warning' : 'info', `[路网衔接] ${trainId} ${on ? '标记紧急换乘接续任务' : '换乘任务解除'}`);
}

export function setPeakMode(peak: boolean | null) {
  forcePeak = peak;
  if (peak === true) addAlert('warning', '[运行模式] 强制高峰 — 经济效益权重提升至27%');
  else if (peak === false) addAlert('info', '[运行模式] 强制平峰');
  else addAlert('info', '[运行模式] 恢复自动检测');
}
