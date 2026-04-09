"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { SystemState, Train, Route, WeatherType, TrackCondition, SystemHistory } from '@/lib/mockState';

const P_COLORS: Record<number, string> = { 1: '#22c55e', 2: '#eab308', 3: '#3b82f6', 4: '#64748b' };
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  normal: { label: '正常', color: '#22c55e' }, delayed: { label: '晚点', color: '#eab308' },
  warning: { label: '预警', color: '#ef4444' }, stopped: { label: '停车', color: '#dc2626' },
};
const WEATHER_OPTS: { key: WeatherType; icon: string; label: string }[] = [
  { key: '晴', icon: '☀️', label: '晴' }, { key: '大雨', icon: '⛈️', label: '雨' },
  { key: '大风', icon: '🌪️', label: '风' }, { key: '雪', icon: '❄️', label: '雪' },
  { key: '雾', icon: '🌫️', label: '雾' },
];
const TRACK_OPTS: { key: TrackCondition; label: string; color: string }[] = [
  { key: 'normal', label: '畅通', color: '#22c55e' },
  { key: 'construction', label: '施工', color: '#eab308' },
  { key: 'obstacle', label: '异物', color: '#ef4444' },
];
const FACTOR_META = [
  { key: 'weatherScore', label: '气象', icon: '🌤️', color: '#38bdf8' },
  { key: 'trackScore', label: '线路', icon: '🛤️', color: '#a78bfa' },
  { key: 'punctualityScore', label: '准点', icon: '⏱️', color: '#fbbf24' },
  { key: 'connectivityScore', label: '衔接', icon: '🔄', color: '#34d399' },
  { key: 'revenueScore', label: '效益', icon: '💰', color: '#f87171' },
] as const;

export default function Dashboard() {
  const [state, setState] = useState<SystemState | null>(null);
  const [activePeak, setActivePeak] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    try { const r = await fetch('/api/data'); setState(await r.json()); } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 3000); return () => clearInterval(iv); }, [fetchData]);

  const postEvent = useCallback(async (body: Record<string, unknown>) => {
    await fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    fetchData();
  }, [fetchData]);

  const triggerPeak = useCallback((v: boolean | null) => { setActivePeak(v); postEvent({ type: 'peak', value: v }); }, [postEvent]);

  if (!state) return (
    <div className="flex h-screen items-center justify-center bg-[#05080f]">
      <p className="text-sm text-slate-500 tracking-widest">系统安全加密连接中...</p>
    </div>
  );

  const { trains, routes, alerts, isPeakHours, history } = state;

  return (
    <div className="h-screen bg-[#05080f] text-slate-300 flex flex-col overflow-hidden leading-tight" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
      {/* ── Header ── */}
      <header className="h-12 flex-shrink-0 flex items-center justify-between px-4 bg-[#0a0d16] border-b border-[#1e293b]">
        <div className="flex items-center gap-6">
          <span className="text-slate-200 text-base font-bold tracking-widest">铁路多维调度决策系统 (MFDS)</span>
          <span className="text-slate-600 text-xs">V4.0</span>
          <span className="text-emerald-500 text-xs font-bold ring-1 ring-emerald-500/50 px-2 py-0.5 rounded-sm bg-emerald-950/30">周期 {state.tickCount.toString().padStart(6, '0')}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex border border-slate-700/50 rounded-sm overflow-hidden bg-slate-900/50">
            {([{ val: null, label: '自适应' }, { val: true, label: '强制高峰' }, { val: false, label: '强制平峰' }] as { val: boolean | null; label: string }[]).map(item => (
              <button key={String(item.val)} onClick={() => triggerPeak(item.val)}
                className={`px-3 py-1.5 text-xs font-bold border-r border-slate-700/50 last:border-0 transition-colors ${activePeak === item.val ? 'bg-blue-900 text-blue-100' : 'text-slate-400 hover:bg-slate-800'}`}
              >{item.label}</button>
            ))}
          </div>
          <div className={`px-3 py-1.5 rounded-sm text-xs font-bold ${isPeakHours ? 'bg-red-950 text-red-500 border border-red-900' : 'bg-emerald-950 text-emerald-500 border border-emerald-900/60'}`}>
            {isPeakHours ? '高峰模式 — 经济效益权重↑' : '平峰模式'}
          </div>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      <div className="h-14 flex-shrink-0 grid grid-cols-7 gap-px bg-[#1e293b]">
        <SI label="活动列车" value={`${trains.length}`} unit="辆" />
        <SI label="实时客流" value={state.stats.totalPassengers.toLocaleString()} unit="人" />
        <SI label="峰值/均速" value={`${state.stats.maxSpeed}/${state.stats.avgSpeed.toFixed(0)}`} unit="km/h" />
        <SI label="准点率" value={`${state.stats.onTimeRate}`} unit="%" warn={state.stats.onTimeRate < 70} />
        <SI label="气象预警" value={`${state.stats.weatherWarnings}`} unit="条" warn={state.stats.weatherWarnings > 0} />
        <SI label="线路异常" value={`${state.stats.trackIssues}`} unit="条" warn={state.stats.trackIssues > 0} />
        <SI label="优先级变更" value={`${state.stats.priorityChanges}`} unit="次" warn={state.stats.priorityChanges > 0} />
      </div>

      {/* ── Main Body ── */}
      <div className="flex-1 flex gap-px bg-[#1e293b] overflow-hidden">
        {/* Left: Table + Controls */}
        <div className="w-[60%] flex flex-col gap-px bg-[#1e293b] overflow-hidden">
          <div className="flex-[60] bg-[#0a0d16] flex flex-col overflow-hidden">
            <PH title="全网列车五维调度矩阵" subtitle="按综合评分降序排列 · 五维因素: 气象/线路/准点/衔接/效益" />
            <div className="flex-1 overflow-auto bg-[#070a11]">
              <TrainTable trains={trains} isPeak={isPeakHours} onToggleTransfer={(id, on) => postEvent({ type: 'trainTransfer', trainId: id, hasTransfer: on })} />
            </div>
          </div>
          <div className="flex-[40] flex gap-px bg-[#1e293b] overflow-hidden">
            <div className="w-[45%] bg-[#0a0d16] flex flex-col overflow-hidden">
              <PH title="路线环境干预控制台" subtitle="按路线独立控制气象与线路状况" />
              <div className="flex-1 overflow-auto p-2">
                <RouteControlPanel routes={routes} trains={trains} onWeather={(rid, w) => postEvent({ type: 'routeWeather', routeId: rid, weather: w })} onTrack={(rid, c) => postEvent({ type: 'routeTrack', routeId: rid, condition: c })} />
              </div>
            </div>
            <div className="flex-1 bg-[#0a0d16] flex flex-col overflow-hidden">
              <PH title="系统日志与调度变更追踪" subtitle="SYSTEM.LOG" />
              <div className="flex-1 overflow-y-auto p-3 bg-[#05070a]">
                {alerts.length === 0 ? <p className="text-slate-600 text-xs">暂无告警</p> :
                  [...alerts].reverse().map(a => (
                    <div key={a.id} className={`flex gap-3 text-xs py-1 px-2 border-l-[3px] mb-1 ${a.level === 'danger' ? 'border-red-500 text-red-400 bg-red-950/20' : a.level === 'warning' ? 'border-yellow-500 text-yellow-500 bg-yellow-950/10' : a.level === 'success' ? 'border-emerald-500 text-emerald-400 bg-emerald-950/10' : 'border-slate-600 text-slate-400 bg-slate-900/40'}`}>
                      <span className="opacity-60 whitespace-nowrap shrink-0">{a.time}</span>
                      <span>{a.message}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Charts & Analysis */}
        <div className="w-[40%] flex flex-col gap-px bg-[#1e293b] overflow-hidden">
          <div className="flex-[33] bg-[#0a0d16] flex flex-col overflow-hidden">
            <PH title="多路线空间态势感知" subtitle="X:里程坐标 Y:即时车速" />
            <div className="flex-1 p-2"><TrackMapChart trains={trains} /></div>
          </div>
          <div className="flex-[34] bg-[#0a0d16] flex flex-col overflow-hidden">
            <PH title="P1目标五维评分雷达" subtitle="多维因素综合分析" />
            <div className="flex-1 p-2"><FactorRadar trains={trains} /></div>
          </div>
          <div className="flex-[33] bg-[#0a0d16] flex gap-px overflow-hidden">
            <div className="w-[45%] flex flex-col border-r border-[#1e293b] overflow-hidden">
              <PH title="优先级分布" />
              <div className="flex-1 p-2"><PriorityPie trains={trains} /></div>
            </div>
            <div className="w-[55%] flex flex-col overflow-hidden">
              <PH title="动态趋势追踪" subtitle="近30周期" />
              <div className="flex-1 p-2"><HistoryChart history={history} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────── Helpers ────────

function PH({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="h-8 flex-shrink-0 flex items-center justify-between px-3 bg-[#0f1422] border-b border-[#1e293b]">
      <span className="text-sm text-slate-300 font-bold tracking-widest">{title}</span>
      {subtitle && <span className="text-[10px] text-slate-500 tracking-wider">{subtitle}</span>}
    </div>
  );
}

function SI({ label, value, unit, warn }: { label: string; value: string; unit: string; warn?: boolean }) {
  return (
    <div className="flex flex-col justify-center px-4 bg-[#0a0d16]">
      <span className="text-[10px] text-slate-500 tracking-wider mb-0.5">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold tabular-nums tracking-wider ${warn ? 'text-red-500' : 'text-slate-100'}`}>{value}</span>
        <span className="text-[10px] text-slate-600 font-bold">{unit}</span>
      </div>
    </div>
  );
}

// ──────── Factor Mini Bars ────────

function FactorBars({ train }: { train: Train }) {
  return (
    <div className="flex gap-1 items-center">
      {FACTOR_META.map(f => {
        const v = train[f.key as keyof Train] as number;
        const bg = v >= 70 ? '#22c55e' : v >= 40 ? '#eab308' : '#ef4444';
        return (
          <div key={f.key} className="flex flex-col items-center gap-0.5" title={`${f.label}: ${v}`}>
            <div className="w-6 h-1.5 bg-[#1e293b] rounded-full overflow-hidden">
              <div className="h-full rounded-full factor-bar" style={{ width: `${v}%`, backgroundColor: bg }} />
            </div>
            <span className="text-[8px] text-slate-600">{f.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ──────── Route Control Panel ────────

function RouteControlPanel({ routes, trains, onWeather, onTrack }: {
  routes: Route[]; trains: Train[];
  onWeather: (rid: string, w: WeatherType) => void;
  onTrack: (rid: string, c: TrackCondition) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {routes.map(r => {
        const rTrains = trains.filter(t => t.routeId === r.id);
        return (
          <div key={r.id} className="border border-[#1e293b] rounded-sm p-2 bg-[#070a11]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-200 tracking-wider">{r.origin}→{r.destination}</span>
              <span className="text-[10px] text-slate-500">{r.distance}km · {rTrains.map(t => t.id).join(' ')}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">气象</span>
                {WEATHER_OPTS.map(w => (
                  <button key={w.key} onClick={() => onWeather(r.id, w.key)}
                    className={`w-7 h-6 text-xs rounded-sm border transition-all ${r.weather === w.key ? 'border-blue-500 bg-blue-900/50 route-btn-active' : 'border-[#1e293b] bg-[#0a0d16] hover:bg-slate-800'}`}
                    title={w.label}>{w.icon}</button>
                ))}
              </div>
              <div className="w-px h-5 bg-[#1e293b]" />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-1">线路</span>
                {TRACK_OPTS.map(t => (
                  <button key={t.key} onClick={() => onTrack(r.id, t.key)}
                    className={`px-1.5 h-6 text-[10px] rounded-sm border transition-all font-bold ${r.trackCondition === t.key ? 'border-blue-500 bg-blue-900/50 route-btn-active' : 'border-[#1e293b] bg-[#0a0d16] hover:bg-slate-800'}`}
                    style={{ color: r.trackCondition === t.key ? t.color : '#64748b' }}
                  >{t.label}</button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ──────── Train Table ────────

function TrainTable({ trains, isPeak, onToggleTransfer }: { trains: Train[]; isPeak: boolean; onToggleTransfer: (id: string, on: boolean) => void }) {
  return (
    <table className="w-full text-xs text-right whitespace-nowrap">
      <thead>
        <tr className="text-slate-400 bg-[#0a0d16] sticky top-0 uppercase tracking-widest">
          <th className="py-2 px-2 text-left font-bold border-b border-[#1e293b]">车次</th>
          <th className="py-2 px-2 text-left font-bold border-b border-[#1e293b]">路线</th>
          <th className="py-2 px-2 text-center font-bold border-b border-[#1e293b]">优先级</th>
          <th className="py-2 px-2 text-center font-bold border-b border-[#1e293b]">状态</th>
          <th className="py-2 px-2 font-bold border-b border-[#1e293b]">车速</th>
          <th className="py-2 px-2 font-bold border-b border-[#1e293b]">客流率</th>
          <th className="py-2 px-2 text-center font-bold border-b border-[#1e293b]">换乘</th>
          <th className="py-2 px-2 font-bold border-b border-[#1e293b]">晚点</th>
          <th className="py-2 px-2 text-center font-bold border-b border-[#1e293b]">五维因子</th>
          <th className="py-2 px-2 font-bold border-b border-[#1e293b]">综合分</th>
          <th className="py-2 px-2 text-left font-bold border-b border-[#1e293b]">调度原因</th>
        </tr>
      </thead>
      <tbody>
        {trains.map(t => {
          const chgClass = t.priorityChanged
            ? (t.priority < t.prevPriority ? 'priority-up' : 'priority-down')
            : '';
          return (
            <tr key={t.id} className={`border-b border-[#1e293b]/70 hover:bg-[#1e293b] transition-colors ${chgClass}`}>
              <td className="py-2 px-2 text-left">
                <span className="font-bold text-slate-200 text-sm tracking-wider">{t.id}</span>
                <span className="text-[10px] text-slate-600 ml-1">{t.trainType}</span>
              </td>
              <td className="py-2 px-2 text-left">
                <span className="text-slate-400 text-[11px]">{t.weatherIcon} {t.routeName}</span>
              </td>
              <td className="py-2 px-2 text-center">
                <span className="font-bold px-2 py-0.5 rounded-sm inline-flex items-center gap-1" style={{ backgroundColor: P_COLORS[t.priority] + '30', color: P_COLORS[t.priority] }}>
                  P{t.priority}
                  {t.priorityChanged && (
                    <span className="text-[10px]">{t.priority < t.prevPriority ? '↑' : '↓'}{t.prevPriority}</span>
                  )}
                </span>
              </td>
              <td className="py-2 px-2 text-center">
                <span style={{ color: STATUS_MAP[t.status]?.color }} className="font-bold text-[10px] tracking-widest border px-1 py-0.5 rounded border-current">
                  {STATUS_MAP[t.status]?.label}
                </span>
              </td>
              <td className="py-2 px-2 text-blue-200 font-bold tabular-nums">{t.speed}</td>
              <td className="py-2 px-2 tabular-nums">
                <span className={`font-bold ${t.loadRate >= 80 ? 'text-emerald-400' : t.loadRate >= 40 ? 'text-slate-300' : 'text-red-400'}`}>{t.loadRate}%</span>
              </td>
              <td className="py-2 px-2 text-center">
                <button onClick={() => onToggleTransfer(t.id, !t.hasTransferTask)}
                  className={`text-[10px] px-1.5 py-0.5 rounded-sm border transition-colors ${t.hasTransferTask ? 'border-orange-500 bg-orange-900/30 text-orange-400 font-bold' : 'border-[#1e293b] text-slate-600 hover:bg-slate-800'}`}
                >{t.hasTransferTask ? '🔄紧急' : '无'}</button>
              </td>
              <td className={`py-2 px-2 tabular-nums font-bold ${t.delayMinutes > 10 ? 'text-red-500' : t.delayMinutes > 0 ? 'text-yellow-500' : 'text-slate-500'}`}>
                {t.delayMinutes > 0 ? `+${t.delayMinutes}分` : '正点'}
              </td>
              <td className="py-2 px-2"><FactorBars train={t} /></td>
              <td className="py-2 px-2 font-bold tabular-nums text-slate-200">{t.totalScore.toFixed(1)}</td>
              <td className="py-2 px-2 text-left text-[10px] text-slate-400 max-w-[140px] truncate" title={t.priorityReason}>{t.priorityReason}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ──────── Charts ────────

function TrackMapChart({ trains }: { trains: Train[] }) {
  const routeColors: Record<string, string> = { R1: '#38bdf8', R2: '#a78bfa', R3: '#fbbf24', R4: '#34d399', R5: '#f87171' };
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#0f1422', borderColor: '#1e293b', textStyle: { color: '#e2e8f0', fontSize: 11, fontFamily: 'monospace' },
      formatter: (p: any) => `${p.name}<br/>位置: ${p.value[0].toFixed(0)}km<br/>车速: ${p.value[1]}km/h` },
    grid: { left: 45, right: 25, top: 25, bottom: 25 },
    xAxis: { type: 'value', min: 0, max: 550, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b', type: 'dotted' } }, name: '里程(km)', nameTextStyle: { color: '#475569', fontSize: 10 } },
    yAxis: { type: 'value', min: 0, max: 350, axisLabel: { color: '#64748b', fontSize: 10 }, splitLine: { lineStyle: { color: '#1e293b' } }, name: '车速', nameTextStyle: { color: '#475569', fontSize: 10 } },
    series: [{ type: 'scatter', symbolSize: (v: any, p: any) => { const t = trains.find(x => x.id === p.name); return t && t.priority === 1 ? 18 : 11; },
      itemStyle: { color: (p: any) => { const t = trains.find(x => x.id === p.name); return t ? routeColors[t.routeId] || '#64748b' : '#64748b'; }, opacity: 0.9, borderColor: '#fff', borderWidth: 0.5 },
      label: { show: true, formatter: '{b}', position: 'top', color: '#cbd5e1', fontSize: 10, fontWeight: 'bold' },
      data: trains.map(t => ({ name: t.id, value: [t.position, t.speed] })) }],
    animationDurationUpdate: 500
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

function FactorRadar({ trains }: { trains: Train[] }) {
  const top = trains[0];
  const second = trains.length > 1 ? trains[trains.length - 1] : null;
  if (!top) return null;
  const indicator = FACTOR_META.map(f => ({ name: f.label, max: 100 }));
  const mkData = (t: Train) => FACTOR_META.map(f => t[f.key as keyof Train] as number);
  const option = {
    backgroundColor: 'transparent',
    legend: { data: [top.id, ...(second ? [second.id] : [])], textStyle: { color: '#94a3b8', fontSize: 11 }, top: 0 },
    radar: { indicator, radius: '60%', axisName: { color: '#94a3b8', fontSize: 11 }, splitArea: { areaStyle: { color: ['#0a0d16', '#0f1422', '#0a0d16', '#0f1422'] } }, splitLine: { lineStyle: { color: '#1e293b' } }, axisLine: { lineStyle: { color: '#1e293b' } } },
    series: [{ type: 'radar', data: [
      { value: mkData(top), name: top.id, areaStyle: { color: 'rgba(34,197,94,0.15)' }, lineStyle: { color: '#22c55e', width: 2 }, itemStyle: { color: '#22c55e' } },
      ...(second ? [{ value: mkData(second), name: second.id, areaStyle: { color: 'rgba(239,68,68,0.10)' }, lineStyle: { color: '#ef4444', width: 1.5, type: 'dashed' as const }, itemStyle: { color: '#ef4444' } }] : []),
    ] }],
  };
  return (
    <div className="flex h-full">
      <div className="flex-1"><ReactECharts option={option} style={{ height: '100%', width: '100%' }} /></div>
      <div className="w-36 flex flex-col justify-center gap-2 pr-2">
        <div className="text-[10px] text-emerald-500 font-bold mb-1">🟢 P1 {top.id}</div>
        {FACTOR_META.map(f => {
          const v = top[f.key as keyof Train] as number;
          return <div key={f.key} className="text-[10px] text-slate-400">{f.icon} {f.label}: <span className={`font-bold ${v >= 70 ? 'text-emerald-400' : v >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{v}</span></div>;
        })}
        <div className="text-[10px] text-slate-300 font-bold border-t border-[#1e293b] pt-1 mt-1">综合评分: {top.totalScore.toFixed(1)}</div>
        <div className="text-[10px] text-slate-500 italic">{top.priorityReason}</div>
      </div>
    </div>
  );
}

function PriorityPie({ trains }: { trains: Train[] }) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  trains.forEach(t => { counts[t.priority] = (counts[t.priority] || 0) + 1; });
  const option = {
    backgroundColor: 'transparent',
    series: [{ type: 'pie', radius: ['45%', '70%'], center: ['40%', '50%'], itemStyle: { borderColor: '#0a0d16', borderWidth: 2 }, label: { show: false },
      data: [
        { value: counts[1], name: 'P1', itemStyle: { color: P_COLORS[1] } },
        { value: counts[2], name: 'P2', itemStyle: { color: P_COLORS[2] } },
        { value: counts[3], name: 'P3', itemStyle: { color: P_COLORS[3] } },
        { value: counts[4], name: 'P4', itemStyle: { color: P_COLORS[4] } },
      ].filter(d => d.value > 0) }],
    animation: false,
  };
  return (
    <div className="flex h-full">
      <div className="w-3/5 h-full"><ReactECharts option={option} style={{ height: '100%', width: '100%' }} /></div>
      <div className="w-2/5 flex flex-col justify-center gap-2">
        {[1, 2, 3, 4].map(p => (
          <div key={p} className="flex justify-between text-xs items-center">
            <span className="flex items-center gap-1.5 text-slate-400"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: P_COLORS[p] }} /> P{p}</span>
            <span className="font-bold text-slate-200 tabular-nums">{counts[p]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryChart({ history }: { history: SystemHistory[] }) {
  if (!history || history.length === 0) return null;
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', backgroundColor: '#0f1422', borderColor: '#1e293b', textStyle: { color: '#e2e8f0', fontSize: 11 } },
    grid: { left: 35, right: 35, top: 20, bottom: 20 },
    xAxis: { type: 'category', data: history.map(h => h.tick), axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: [
      { type: 'value', min: 'dataMin', splitLine: { lineStyle: { color: '#1e293b' } }, axisLabel: { color: '#3b82f6', fontSize: 10 } },
      { type: 'value', min: 0, splitLine: { show: false }, axisLabel: { color: '#ef4444', fontSize: 10 } },
    ],
    series: [
      { name: '均速', type: 'line', data: history.map(h => h.avgSpeed), lineStyle: { color: '#3b82f6', width: 2 }, symbol: 'none', yAxisIndex: 0 },
      { name: '优先级变更', type: 'bar', data: history.map(h => h.priorityChanges), itemStyle: { color: '#ef4444' }, barWidth: 4, yAxisIndex: 1 },
    ],
    animation: false,
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}
