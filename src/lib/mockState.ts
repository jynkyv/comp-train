/**
 * 铁道车辆智能调度与监控系统 - Mock 数据引擎
 * 对标 Python 版调度算法逻辑 (V3.2.6)
 *
 * 核心模块:
 *  - DataGenerator: 天气系数 × 基础速度 = 实际速度，高峰/平峰乘客量区分
 *  - EnhancedValidator: 速度校验(>350 截断)、优先级强制1-4
 *  - Scheduler: 速度分箱(qcut 4级)、恶劣天气优先级上限2、近站提权
 *  - PriorityAdjuster: 高峰期综合评分 speed*0.6 + passengers*0.4
 */

// ─────────────────── Types ───────────────────

export type WeatherType = '晴' | '多云' | '小雨' | '大雨' | '雪' | '雾';

export interface Train {
  id: string;
  weather: WeatherType;
  weatherIcon: string;
  speed: number;
  position: number;       // 0 ~ 1000 km
  temperature: number;
  passengers: number;
  priority: number;       // 1(最高) ~ 4(最低)
  priorityScore: number;  // 高峰期综合评分
  timestamp: string;
  status: 'normal' | 'delayed' | 'warning';
  // ── 新增：深度遥测数据 ──
  voltage: number;        // 触网电压 kV (25.0 ~ 29.0)
  brakingDist: number;    // 预估制动距离 m
  eta: number;            // 下一站 ETA (min)
  friction: number;       // 轨面对接系数 (0.0 ~ 1.0)
}

export interface SystemHistory {
  tick: number;
  avgSpeed: number;
  passengers: number;
  powerLoad: number;      // 模拟电网负载
}

export interface SystemState {
  trains: Train[];
  isPeakHours: boolean;
  alerts: Alert[];
  history: SystemHistory[]; // 新增：用于绘制实时折线图
  stats: {
    totalPassengers: number;
    maxSpeed: number;
    avgSpeed: number;
    weatherWarnings: number;
    onTimeRate: number;
    powerGridLoad: number;  // 整体电网负载 %
  };
  tickCount: number;
}

export interface Alert {
  id: number;
  time: string;
  message: string;
  level: 'info' | 'warning' | 'danger' | 'success';
}

// ─────────────────── Constants ───────────────────

const WEATHER_CONDITIONS: Record<WeatherType, { ratio: number; icon: string }> = {
  '晴':   { ratio: 1.00, icon: '☀️' },
  '多云': { ratio: 0.95, icon: '⛅' },
  '小雨': { ratio: 0.85, icon: '🌧️' },
  '大雨': { ratio: 0.75, icon: '⛈️' },
  '雪':   { ratio: 0.65, icon: '❄️' },
  '雾':   { ratio: 0.80, icon: '🌫️' },
};

const WEATHER_KEYS = Object.keys(WEATHER_CONDITIONS) as WeatherType[];

// ─────────────────── DataGenerator ───────────────────

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function nowTimeStr(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function isPeakHours(): boolean {
  const h = new Date().getHours();
  return (h >= 7 && h < 9) || (h >= 17 && h < 19);
}

/** 生成列车原始数据，对标 DataGenerator.generate_train_data */
function generateTrainData(numTrains: number = 8, forcePeak: boolean | null = null): Train[] {
  const peak = forcePeak !== null ? forcePeak : isPeakHours();
  const trains: Train[] = [];

  for (let i = 1; i <= numTrains; i++) {
    const weatherKey = WEATHER_KEYS[randomInt(0, WEATHER_KEYS.length - 1)];
    const { ratio, icon } = WEATHER_CONDITIONS[weatherKey];
    const baseSpeed = randomInt(150, 300);
    const actualSpeed = Math.round(baseSpeed * ratio);
    const [pMin, pMax] = peak ? [1500, 2500] : [800, 1500];

    const distanceToStation = randomFloat(5, 500); // 假定下一站距离
    
    trains.push({
      id: `G${i.toString().padStart(2, '0')}`,
      weather: weatherKey,
      weatherIcon: icon,
      speed: actualSpeed,
      position: randomFloat(0, 1000),
      temperature: randomInt(-10, 40),
      passengers: randomInt(pMin, pMax),
      priority: 0,
      priorityScore: 0,
      timestamp: nowTimeStr(),
      status: 'normal',
      voltage: Number(randomFloat(25.0, 27.5).toFixed(1)),
      brakingDist: Math.round((actualSpeed * actualSpeed) / 100), // 简单的动能模拟
      eta: Math.round((distanceToStation / Math.max(1, actualSpeed)) * 60),
      friction: Number(randomFloat(0.7, 0.95).toFixed(2)),
    });
  }

  // 处理速度重复：若最后两列车速度相同，末班车+10km/h
  if (trains.length >= 2) {
    const speeds = new Set(trains.map(t => t.speed));
    if (speeds.size === 1) {
      trains[trains.length - 1].speed += 10;
    }
  }

  return trains;
}

// ─────────────────── EnhancedValidator ───────────────────

function validateSpeed(trains: Train[]): Train[] {
  // 速度变化不足
  const uniqueSpeeds = new Set(trains.map(t => t.speed));
  if (uniqueSpeeds.size < 2) {
    const minSpeed = Math.min(...trains.map(t => t.speed));
    trains.forEach(t => {
      if (t.speed === minSpeed) {
        t.speed += 1;
      }
    });
    addAlert('warning', '[数据校验] 速度值变化不足，已启用备用微调校验');
  }

  // 超速截断 >350 => 350
  trains.forEach(t => {
    if (t.speed > 350) {
      addAlert('warning', `[数据校验] 列车 ${t.id} 速度异常 (${t.speed} km/h)，已修正为 350 km/h`);
      t.speed = 350;
    }
  });

  return trains;
}

function validatePriority(trains: Train[]): Train[] {
  trains.forEach(t => {
    t.priority = Math.max(1, Math.min(4, Math.round(t.priority)));
  });
  return trains;
}

// ─────────────────── Scheduler ───────────────────

/** 速度分箱(qcut)：将速度从大到小分为4级 (1=最快=最高优先, 4=最慢) */
function qcutPriority(trains: Train[]): void {
  const sorted = [...trains].sort((a, b) => b.speed - a.speed);
  const n = sorted.length;

  sorted.forEach((t, idx) => {
    const ratio = idx / n;
    if (ratio < 0.2)       t.priority = 1;
    else if (ratio < 0.5)  t.priority = 2;
    else if (ratio < 0.8)  t.priority = 3;
    else                    t.priority = 4;
  });

  // 写回
  const map = new Map(sorted.map(t => [t.id, t.priority]));
  trains.forEach(t => { t.priority = map.get(t.id) || t.priority; });
}

/**
 * 调度排期算法 — 对标 Scheduler.generate_schedule
 *  - 速度分箱为4级
 *  - 恶劣天气(大雨/雪) => 优先级上限为2
 *  - 接近车站(<50km) => 优先级-1 (更高)
 */
function generateSchedule(trains: Train[]): Train[] {
  // 前置校验
  validateSpeed(trains);

  try {
    // 速度四分位分箱
    qcutPriority(trains);

    // 恶劣天气约束: 大雨/雪 => priority capped at 2
    trains.forEach(t => {
      if (t.weather === '大雨' || t.weather === '雪') {
        t.priority = Math.min(t.priority, 2);
      }
    });
  } catch {
    // fallback: 按速度降序排名
    const sorted = [...trains].sort((a, b) => b.speed - a.speed);
    sorted.forEach((t, idx) => { t.priority = idx + 1; });
    addAlert('warning', '[调度引擎] 分箱失败，使用备用排名方法');
  }

  // 约束1: 确保至少3个优先级层级
  const uniquePriorities = new Set(trains.map(t => t.priority));
  if (uniquePriorities.size < 3) {
    const sorted = [...trains].sort((a, b) => a.speed - b.speed);
    const n = sorted.length;
    const binSize = Math.ceil(n / 3);
    sorted.forEach((t, idx) => {
      t.priority = 3 - Math.floor(idx / binSize);
    });
    const map = new Map(sorted.map(t => [t.id, t.priority]));
    trains.forEach(t => { t.priority = map.get(t.id) || t.priority; });
  }

  // 约束2: 接近车站(<50km)优先级+提升(priority-1)
  trains.forEach(t => {
    if (t.position < 50) {
      t.priority = Math.max(1, t.priority - 1);
      addAlert('info', `[进站调度] 列车 ${t.id} 接近车站 (${t.position.toFixed(1)}km)，优先级提升至 P${t.priority}`);
    }
  });

  // 最终校验
  validatePriority(trains);

  // 按 priority ASC, speed DESC 排序
  trains.sort((a, b) => a.priority - b.priority || b.speed - a.speed);
  return trains;
}

// ─────────────────── PriorityAdjuster ───────────────────

/**
 * 高峰期优先级调整 — 对标 PriorityAdjuster.adjust_priority
 * 综合评分 = speed * 0.6 + passengers * 0.4
 * 对综合评分做qcut分箱
 */
function adjustPriorityForPeak(trains: Train[]): Train[] {
  trains.forEach(t => {
    t.priorityScore = t.speed * 0.6 + t.passengers * 0.4;
  });

  const sorted = [...trains].sort((a, b) => b.priorityScore - a.priorityScore);
  const n = sorted.length;

  sorted.forEach((t, idx) => {
    const ratio = idx / n;
    if (ratio < 0.2)       t.priority = 1;
    else if (ratio < 0.5)  t.priority = 2;
    else if (ratio < 0.8)  t.priority = 3;
    else                    t.priority = 4;
  });

  const map = new Map(sorted.map(t => [t.id, t.priority]));
  trains.forEach(t => { t.priority = map.get(t.id) || t.priority; });

  addAlert('info', '[高峰调度] 综合评分权重: 速度60% + 客流40%，已重新分箱确定优先级');

  trains.sort((a, b) => a.priority - b.priority || b.speed - a.speed);
  return trains;
}

// ─────────────────── Status Derivation ───────────────────

function deriveStatus(t: Train): 'normal' | 'delayed' | 'warning' {
  if (t.weather === '大雨' || t.weather === '雪') return 'warning';
  if (t.priority === 1) return 'normal';
  if (t.speed < 120) return 'delayed';
  return 'normal';
}

// ─────────────────── Global State ───────────────────

let alertIdSeq = 0;
let alertBuffer: Alert[] = [];
let forceWeather: WeatherType | null = null;
let forcePeak: boolean | null = null;
let tickCount = 0;
let sysHistory: SystemHistory[] = [];

function addAlert(level: Alert['level'], message: string) {
  alertBuffer.push({
    id: ++alertIdSeq,
    time: nowTimeStr(),
    message,
    level,
  });
  // 只保留最近 20 条
  if (alertBuffer.length > 20) {
    alertBuffer = alertBuffer.slice(-20);
  }
}

// ─────────────────── Public API ───────────────────

export function tick(): SystemState {
  tickCount++;

  // 生成原始数据
  const peak = forcePeak !== null ? forcePeak : isPeakHours();
  let trains = generateTrainData(8, peak);

  // 如果强制了天气，覆盖所有列车天气
  if (forceWeather) {
    const wc = WEATHER_CONDITIONS[forceWeather];
    trains.forEach(t => {
      t.weather = forceWeather!;
      t.weatherIcon = wc.icon;
      t.speed = Math.round(t.speed * wc.ratio / WEATHER_CONDITIONS[t.weather].ratio * wc.ratio);
      // 重新计算速度
      const baseSpeed = randomInt(150, 300);
      t.speed = Math.round(baseSpeed * wc.ratio);
    });
  }

  // 调度算法
  trains = generateSchedule(trains);

  // 高峰期调整
  if (peak) {
    trains = adjustPriorityForPeak(trains);
  }

  // 状态推导
  trains.forEach(t => { t.status = deriveStatus(t); });

  // 统计数据
  const totalPassengers = trains.reduce((s, t) => s + t.passengers, 0);
  const maxSpeed = Math.max(...trains.map(t => t.speed));
  const avgSpeed = trains.reduce((s, t) => s + t.speed, 0) / trains.length;
  const weatherWarnings = trains.filter(t => t.weather === '大雨' || t.weather === '雪').length;
  const normalCount = trains.filter(t => t.status === 'normal').length;
  const onTimeRate = Math.round((normalCount / trains.length) * 100);
  
  // 更新历史数据
  const powerGridLoad = Number(randomFloat(65, 92).toFixed(1));
  sysHistory.push({
    tick: tickCount,
    avgSpeed: Number(avgSpeed.toFixed(0)),
    passengers: totalPassengers,
    powerLoad: powerGridLoad
  });
  if (sysHistory.length > 30) {
    sysHistory.shift();
  }

  const state: SystemState = {
    trains,
    isPeakHours: peak,
    alerts: [...alertBuffer],
    history: [...sysHistory],
    stats: {
      totalPassengers,
      maxSpeed,
      avgSpeed,
      weatherWarnings,
      onTimeRate,
      powerGridLoad,
    },
    tickCount,
  };

  return state;
}

export function setWeather(weather: WeatherType | null) {
  forceWeather = weather;
  if (weather) {
    addAlert('danger', `[气象局警告] 全线天气强制切换为「${weather}」${WEATHER_CONDITIONS[weather].icon}，速度系数 ${WEATHER_CONDITIONS[weather].ratio}`);
  } else {
    addAlert('success', '[气象局] 天气恢复为随机自然状态');
  }
}

export function setPeakMode(peak: boolean | null) {
  forcePeak = peak;
  if (peak === true) {
    addAlert('warning', '[运行模式] 强制切换为高峰时段模式 — 综合评分机制启动');
  } else if (peak === false) {
    addAlert('info', '[运行模式] 强制切换为平峰时段模式');
  } else {
    addAlert('info', '[运行模式] 恢复自动检测高峰/平峰');
  }
}

export function getWeatherList(): { key: WeatherType; icon: string; ratio: number }[] {
  return WEATHER_KEYS.map(k => ({
    key: k,
    icon: WEATHER_CONDITIONS[k].icon,
    ratio: WEATHER_CONDITIONS[k].ratio,
  }));
}
