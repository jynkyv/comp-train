"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { SystemState, Train, WeatherType, SystemHistory } from '@/lib/mockState';

const PRIORITY_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#eab308',
  3: '#3b82f6',
  4: '#64748b',
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  normal:  { label: '正常运行',  color: '#22c55e' },
  delayed: { label: '降速晚点', color: '#eab308' },
  warning: { label: '气象预警', color: '#ef4444' },
};

const WEATHER_BUTTONS: { key: WeatherType | null; label: string; ratio: string }[] = [
  { key: null,   label: '系统自适应',  ratio: '实时物理环境' },
  { key: '晴',   label: '艳阳 (晴)',   ratio: '阻力系数 1.00' },
  { key: '大雨', label: '暴雨 (大雨)', ratio: '阻力系数 0.75' },
  { key: '雪',   label: '暴雪 (雪)',   ratio: '阻力系数 0.65' },
  { key: '雾',   label: '浓雾 (雾)',   ratio: '阻力系数 0.80' },
];

export default function Dashboard() {
  const [state, setState] = useState<SystemState | null>(null);
  const [activeWeather, setActiveWeather] = useState<WeatherType | null>(null);
  const [activePeak, setActivePeak] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/data');
      const data: SystemState = await res.json();
      setState(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const triggerWeather = useCallback(async (weather: WeatherType | null) => {
    setActiveWeather(weather);
    await fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'weather', value: weather }),
    });
    fetchData(); // 消除延迟：状态下发后立刻强刷面板
  }, [fetchData]);

  const triggerPeak = useCallback(async (peak: boolean | null) => {
    setActivePeak(peak);
    await fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'peak', value: peak }),
    });
    fetchData(); // 消除延迟：状态下发后立刻强刷面板
  }, [fetchData]);

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#05080f]">
        <p className="text-sm text-slate-500 tracking-widest">系统安全加密连接中...</p>
      </div>
    );
  }

  const { trains, stats, alerts, isPeakHours, history } = state;

  return (
    <div className="h-screen bg-[#05080f] text-slate-300 flex flex-col overflow-hidden leading-tight" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
      {/* ── 顶栏 ── */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 bg-[#0a0d16] border-b border-[#1e293b]">
        <div className="flex items-center gap-6">
          <span className="text-slate-200 text-base font-bold tracking-widest">铁路调度控制枢纽 (CR-SCADA)</span>
          <span className="text-slate-600 text-xs">安全协议 v3.3.0</span>
          <span className="text-emerald-500 text-xs font-bold ring-1 ring-emerald-500/50 px-2 py-0.5 rounded-sm bg-emerald-950/30">时序周期 {state.tickCount.toString().padStart(6, '0')}</span>
          <span className="text-slate-500 text-xs">持续运行时间：{Math.floor(state.tickCount * 3 / 60)}分{(state.tickCount * 3 % 60).toString().padStart(2, '0')}秒</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex border border-slate-700/50 rounded-sm overflow-hidden bg-slate-900/50">
            {([
              { val: null, label: '自适应推演' },
              { val: true, label: '强制高峰算法' },
              { val: false, label: '强制平峰算法' },
            ] as { val: boolean | null; label: string }[]).map(item => (
              <button
                key={String(item.val)}
                onClick={() => triggerPeak(item.val)}
                className={`px-4 py-1.5 text-xs font-bold border-r border-slate-700/50 last:border-0 transition-colors ${
                  activePeak === item.val
                    ? 'bg-blue-900 text-blue-100 shadow-[inset_0_0_8px_rgba(59,130,246,0.5)]'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >{item.label}</button>
            ))}
          </div>
          <div className={`px-4 py-1.5 rounded-sm text-xs font-bold ${
            isPeakHours
              ? 'bg-red-950 text-red-500 border border-red-900 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
              : 'bg-emerald-950 text-emerald-500 border border-emerald-900/60'
          }`}>
            当前客流模式：{isPeakHours ? '客流负荷过载 (高峰)' : '系统负荷稳定 (平峰)'}
          </div>
        </div>
      </header>

      {/* ── 系统级宏观核心指标区 ── */}
      <div className="h-16 flex-shrink-0 grid grid-cols-6 gap-px bg-[#1e293b]">
        <StatsItem label="路网内活动列车" value={`${trains.length}`} unit="辆" />
        <StatsItem label="实时客流吞吐量" value={stats.totalPassengers.toLocaleString()} unit="人" />
        <StatsItem label="全网峰值/均值车速" value={`${stats.maxSpeed} / ${stats.avgSpeed.toFixed(0)}`} unit="公里/小时" />
        <StatsItem label="系统级准点达成率" value={`${stats.onTimeRate}`} unit="%" warn={stats.onTimeRate < 80} />
        <StatsItem label="供电轨道网络负荷" value={`${stats.powerGridLoad}`} unit="%" warn={stats.powerGridLoad > 88} />
        <StatsItem label="气象环境危险告警" value={`${stats.weatherWarnings}`} unit="起预警" warn={stats.weatherWarnings > 0} />
      </div>

      {/* ── 中央控制台主体 (Flex稳定布局) ── */}
      <div className="flex-1 flex gap-px bg-[#1e293b] overflow-hidden">
        
        {/* 【左侧：核心调度矩阵 + 微观子系统】占比约 60% */}
        <div className="w-[58%] flex flex-col gap-px bg-[#1e293b] overflow-hidden">
          {/* 上半部：核心矩阵 */}
          <div className="flex-[65] bg-[#0a0d16] flex flex-col overflow-hidden">
            <PanelHeader title="全网列车实时调度数据矩阵" subtitle="依据系统运算优先级自动降序排列" />
            <div className="flex-1 overflow-auto bg-[#070a11]">
              <TrainTable trains={trains} isPeakHours={isPeakHours} />
            </div>
          </div>

          {/* 下半部：气象与日志 */}
          <div className="flex-[35] flex gap-px bg-[#1e293b] overflow-hidden">
            <div className="w-[35%] bg-[#0a0d16] flex flex-col">
              <PanelHeader title="气象气压强干预面板" />
              <div className="flex-1 p-4 grid grid-cols-1 gap-2 overflow-auto">
                {WEATHER_BUTTONS.map(w => (
                  <button
                    key={w.label}
                    onClick={() => triggerWeather(w.key)}
                    className={`flex items-center justify-between px-3 py-2 text-sm border rounded-sm transition-colors ${
                      activeWeather === w.key
                        ? 'bg-slate-700 text-white border-slate-400 font-bold'
                        : 'bg-[#05080f] text-slate-400 border-[#1e293b] hover:bg-slate-800'
                    }`}
                  >
                    <span className="tracking-wide">{w.label}</span>
                    <span className="text-xs opacity-60">[{w.ratio}]</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 bg-[#0a0d16] flex flex-col overflow-hidden">
              <PanelHeader title="系统日志追溯与告警分发" subtitle="SYSTEM.LOG.FLUSH" />
              <div className="flex-1 overflow-y-auto p-3 bg-[#05070a]">
                {alerts.length === 0 ? (
                  <p className="text-slate-600 text-xs">通讯线路安静，暂无告警信息</p>
                ) : (
                  [...alerts].reverse().map(a => (
                    <div key={a.id} className={`flex gap-3 text-xs py-1 px-2 border-l-[3px] mb-1 ${
                      a.level === 'danger'  ? 'border-red-500 text-red-400 bg-red-950/20' :
                      a.level === 'warning' ? 'border-yellow-500 text-yellow-500 bg-yellow-950/10' :
                      a.level === 'success' ? 'border-emerald-500 text-emerald-400 bg-emerald-950/10' :
                                              'border-slate-600 text-slate-400 bg-slate-900/40'
                    }`}>
                       <span className="opacity-60 whitespace-nowrap shrink-0">{a.time}</span>
                       <span>{a.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 【右侧：数据可视化群】占比约 42% */}
        <div className="w-[42%] flex flex-col gap-px bg-[#1e293b] overflow-hidden">
          {/* 右1：时空探测雷达 */}
          <div className="flex-[33] bg-[#0a0d16] flex flex-col overflow-hidden">
            <PanelHeader title="一维地理空间坐标雷达" subtitle="X轴:里程式追踪 Y轴:运动切线速度" />
            <div className="flex-1 p-2">
              <TrackMapChart trains={trains} />
            </div>
          </div>

          {/* 右2：高优先级单车深度侦测仪 */}
          <div className="flex-[34] bg-[#0a0d16] flex flex-col overflow-hidden">
            <PanelHeader title="最高优先级目标锁定分析" subtitle="深度遥测诊断仪" />
            <div className="flex-1 p-4">
              <DeepTelemetryPanel trains={trains} tick={state.tickCount} />
            </div>
          </div>

          {/* 右3：双通道历史数据与统计 */}
          <div className="flex-[33] bg-[#0a0d16] flex gap-px overflow-hidden">
            <div className="w-[45%] flex flex-col border-r border-[#1e293b] overflow-hidden">
               <PanelHeader title="优先级系统资源池" />
               <div className="flex-1 p-2">
                   <PriorityPieChart trains={trains} />
               </div>
            </div>
            <div className="w-[55%] flex flex-col overflow-hidden">
               <PanelHeader title="动态吞吐与流速追踪" subtitle="最近三十个时钟周期" />
               <div className="flex-1 p-2">
                   <HistoryLineChart history={history} />
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ──────── 辅助排版组件 ────────

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="h-8 flex-shrink-0 flex items-center justify-between px-3 bg-[#0f1422] border-b border-[#1e293b]">
      <span className="text-sm text-slate-300 font-bold tracking-widest">{title}</span>
      {subtitle && <span className="text-[10px] text-slate-500 tracking-wider font-normal">{subtitle}</span>}
    </div>
  );
}

function StatsItem({ label, value, unit, warn }: { label: string; value: string; unit: string; warn?: boolean }) {
  return (
    <div className="flex flex-col justify-center px-4 bg-[#0a0d16] border-[#1e293b]">
      <span className="text-xs text-slate-500 tracking-wider mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
          <span className={`text-xl font-bold tabular-nums tracking-wider ${warn ? 'text-red-500' : 'text-slate-100'}`}>{value}</span>
          <span className="text-[10px] text-slate-600 font-bold">{unit}</span>
      </div>
    </div>
  );
}

// ──────── 核心表格组件 ────────

function TrainTable({ trains, isPeakHours }: { trains: Train[]; isPeakHours: boolean }) {
  return (
    <table className="w-full text-xs text-right whitespace-nowrap">
      <thead>
        <tr className="text-slate-400 bg-[#0a0d16] sticky top-0 uppercase tracking-widest">
          <th className="py-2.5 px-3 text-left font-bold border-b border-[#1e293b]">列车车次 / 识别码</th>
          <th className="py-2.5 px-3 text-left font-bold border-b border-[#1e293b]">调度干预等级</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b] text-center">综合运行状态</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">即时轮速 (KM/H)</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">定位坐标 (KM)</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">承载客流 (人次)</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">高峰加权分值</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">触网取电 (KV)</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">制动衰变距 (m)</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b]">预测到站 (分)</th>
          <th className="py-2.5 px-3 font-bold border-b border-[#1e293b] text-center">轮轨粘着系数</th>
        </tr>
      </thead>
      <tbody>
        {trains.map(t => {
          const isBadWeather = t.weather === '大雨' || t.weather === '雪';
          return (
            <tr key={t.id} className={`border-b border-[#1e293b]/70 hover:bg-[#1e293b] transition-colors ${isBadWeather ? 'bg-red-950/20' : ''}`}>
              <td className="py-2.5 px-3 font-bold text-slate-200 text-left text-sm tracking-widest">{t.id}</td>
              <td className="py-2.5 px-3 text-left">
                <span className="font-bold px-2 py-0.5 rounded-sm" style={{ backgroundColor: PRIORITY_COLORS[t.priority] + '30', color: PRIORITY_COLORS[t.priority] }}>优先级 P{t.priority}</span>
              </td>
              <td className="py-2.5 px-3 text-center">
                <span style={{ color: STATUS_MAP[t.status].color }} className="font-bold tracking-widest border px-1.5 py-0.5 rounded border-current">{STATUS_MAP[t.status].label}</span>
              </td>
              <td className="py-2.5 px-3 text-blue-200 font-bold tabular-nums text-sm">{t.speed.toFixed(0)}</td>
              <td className="py-2.5 px-3 text-slate-400 tabular-nums">{t.position.toFixed(1)}</td>
              <td className="py-2.5 px-3 text-slate-300 tabular-nums font-bold tracking-wider">{t.passengers}</td>
              <td className="py-2.5 px-3 text-emerald-400/80 tabular-nums font-bold">{isPeakHours ? t.priorityScore.toFixed(0) : '未启用'}</td>
              <td className={`py-2.5 px-3 tabular-nums font-bold ${t.voltage < 25.5 ? 'text-yellow-500 bg-yellow-900/20' : 'text-slate-400'}`}>{t.voltage.toFixed(1)}</td>
              <td className="py-2.5 px-3 text-slate-400 tabular-nums">{t.brakingDist}</td>
              <td className="py-2.5 px-3 text-slate-400 tabular-nums">{t.eta}</td>
              <td className={`py-2.5 px-3 tabular-nums font-bold text-center ${t.friction < 0.8 ? 'text-red-500 bg-red-900/20' : 'text-slate-400'}`}>{t.friction.toFixed(2)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────── 新增深度遥测面板组件 ────────

function DeepTelemetryPanel({ trains, tick }: { trains: Train[]; tick: number }) {
  // 锁定排名第一的列车
  const target = trains[0];
  
  if (!target) return <div className="text-slate-500 text-sm">无法获取目标序列</div>;

  // 根据当前列车的状态构造随机波动的虚拟深度数据
  const axleTemp = useMemo(() => (30 + (target.speed / 10) + Math.sin(tick) * 5).toFixed(1), [target.speed, tick]);
  const motorTorque = useMemo(() => (3000 * (target.speed / 200) + Math.cos(tick) * 200).toFixed(0), [target.speed, tick]);
  const networkLatency = useMemo(() => target.friction < 0.8 ? (40 + Math.random() * 80).toFixed(1) : (12 + Math.random() * 5).toFixed(1), [target.friction, tick]);
  const cpuLoad = useMemo(() => (40 + Math.random() * 40).toFixed(1), [tick]);

  const bars = [
    { label: '车厢环境二氧化碳浓度', value: target.passengers / 2, max: 1500, unit: 'PPM', isWarn: target.passengers / 2 > 1000 },
    { label: '动力电机扭矩输出负载', value: Number(motorTorque), max: 5000, unit: 'N·m', isWarn: Number(motorTorque) > 4200 },
    { label: '实时车地无线通讯延迟', value: Number(networkLatency), max: 150, unit: 'ms', isWarn: Number(networkLatency) > 80 },
  ];

  return (
    <div className="flex flex-col h-full justify-between gap-3 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 to-[#0a0d16] rounded-sm relative isolate p-2">
       {/* 装饰水印 */}
       <div className="absolute right-0 bottom-0 text-[80px] font-bold text-blue-500/[0.03] select-none z-[-1] tracking-tighter">
          {target.id}
       </div>
       <div className="flex justify-between items-start">
         <div className="flex flex-col gap-1">
            <span className="text-xs text-blue-400 font-bold tracking-widest border-b border-blue-900/50 pb-1">当前首要干预目标</span>
            <span className="text-3xl font-extrabold text-blue-100 tabular-nums tracking-tighter mt-1">{target.id}</span>
            <span className="text-xs text-slate-400">坐标: {target.position.toFixed(2)} KM | 里程区块 #0{Math.floor(target.position / 100)}</span>
         </div>
         <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-right">
            <div>
              <div className="text-[10px] text-slate-500 mb-0.5">测算轮轴异常温度</div>
              <div className="text-sm font-bold text-orange-400 tabular-nums">{axleTemp} °C</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 mb-0.5">列车行车电脑负载</div>
              <div className="text-sm font-bold text-emerald-400 tabular-nums">{cpuLoad} %</div>
            </div>
         </div>
       </div>

       {/* 深度指标监控进度条 */}
       <div className="flex flex-col gap-3 mt-4 flex-1 justify-end">
          {bars.map((b, i) => (
             <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between text-[11px]">
                   <span className="text-slate-400">{b.label}</span>
                   <span className={`tabular-nums font-bold ${b.isWarn ? 'text-red-400' : 'text-slate-200'}`}>{b.value.toFixed(0)} <span className="opacity-50 text-[9px]">{b.unit}</span></span>
                </div>
                <div className="h-1.5 w-full bg-[#1e293b] rounded-full overflow-hidden">
                   <div 
                      className={`h-full transition-all duration-500 origin-left ${b.isWarn ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'}`} 
                      style={{ width: `${Math.min(100, (b.value / b.max) * 100)}%` }}
                   />
                </div>
             </div>
          ))}
       </div>
    </div>
  );
}

// ──────── 复杂 ECharts 组件 ────────

function TrackMapChart({ trains }: { trains: Train[] }) {
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#0f1422', borderColor: '#1e293b', textStyle: { color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace' }, formatter: (p: any) => `${p.name}<br/>定位点: ${p.value[0].toFixed(1)}公里区域<br/>瞬时车速: ${p.value[1]}公里/小时` },
    grid: { left: 45, right: 30, top: 30, bottom: 25 },
    xAxis: { type: 'value', min: 0, max: 1000, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { show: true, lineStyle: { color: '#1e293b', type: 'dotted' } }, name: '沿线地理坐标 (公里)', nameLocation: 'middle', nameGap: -5, nameTextStyle: { color: '#475569', fontSize: 10, align: 'right' } },
    yAxis: { type: 'value', min: 100, max: 350, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { show: true, lineStyle: { color: '#1e293b' } }, name: '车速计量', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: '#475569', fontSize: 10 } },
    series: [{
      type: 'scatter',
      symbolSize: (val: any, params: any) => {
        const t = trains.find(x => x.id === params.name);
        return t && t.priority === 1 ? 16 : 10;
      },
      itemStyle: { color: (params: any) => { const t = trains.find(x => x.id === params.name); return t ? PRIORITY_COLORS[t.priority] : '#64748b'; }, opacity: 0.9, borderColor: '#fff', borderWidth: 0.5 },
      label: { show: true, formatter: '{b}', position: 'top', color: '#cbd5e1', fontSize: 11, fontWeight: 'bold' },
      data: trains.map(t => ({ name: t.id, value: [t.position, t.speed] }))
    }],
    animationDurationUpdate: 500
  };

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

function HistoryLineChart({ history }: { history: SystemHistory[] }) {
  if (!history || history.length === 0) return null;
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#0f1422', borderColor: '#1e293b', textStyle: { color: '#e2e8f0', fontSize: 11 } },
    grid: { left: 35, right: 35, top: 20, bottom: 20 },
    xAxis: { type: 'category', data: history.map(h => h.tick), axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: [
      { type: 'value', min: 'dataMin', splitLine: { lineStyle: { color: '#1e293b' } }, axisLabel: { color: '#3b82f6', fontSize: 10 } },
      { type: 'value', min: 'dataMin', splitLine: { show: false }, axisLabel: { color: '#22c55e', fontSize: 10 } }
    ],
    series: [
      { name: '平均车速轨迹', type: 'line', step: 'middle', data: history.map(h => h.avgSpeed), lineStyle: { color: '#3b82f6', width: 2 }, symbol: 'none', yAxisIndex: 0 },
      { name: '总客流负载', type: 'line', data: history.map(h => h.passengers), lineStyle: { color: '#22c55e', width: 1.5, type: 'dashed' }, itemStyle: { color: '#22c55e' }, symbol: 'none', yAxisIndex: 1 }
    ],
    animation: false
  };

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

function PriorityPieChart({ trains }: { trains: Train[] }) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  trains.forEach(t => { counts[t.priority] = (counts[t.priority] || 0) + 1; });

  const option = {
    backgroundColor: 'transparent',
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      center: ['40%', '50%'],
      itemStyle: { borderColor: '#0a0d16', borderWidth: 2 },
      label: { show: false },
      data: [
         { value: counts[1], name: '极高预警(P1)', itemStyle: { color: PRIORITY_COLORS[1] } },
         { value: counts[2], name: '高负荷(P2)', itemStyle: { color: PRIORITY_COLORS[2] } },
         { value: counts[3], name: '正常运行(P3)', itemStyle: { color: PRIORITY_COLORS[3] } },
         { value: counts[4], name: '降速巡航(P4)', itemStyle: { color: PRIORITY_COLORS[4] } },
      ].filter(d => d.value > 0),
    }],
    animation: false,
  };

  return (
    <div className="flex h-full relative">
      <div className="w-3/5 h-full"><ReactECharts option={option} style={{ height: '100%', width: '100%' }} /></div>
      <div className="w-2/5 flex flex-col justify-center gap-2">
        {[1, 2, 3, 4].map(priority => (
          <div key={priority} className="flex flex-col gap-0.5">
             <div className="flex justify-between text-xs items-center">
                 <span className="flex items-center gap-1.5 text-slate-400">
                   <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PRIORITY_COLORS[priority] }} /> P{priority} 级
                 </span>
                 <span className="font-bold text-slate-200 tabular-nums">{counts[priority]}</span>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
