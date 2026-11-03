import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import packJson from './data/area-pack.json';
import type { Mission } from './core/missions';
import { validatePack, type AreaPack } from './core/pack';
import { pruneRawLogs } from './platform/maintenance';
import { walkSensors } from './platform/recorder';
import { SessionController, type FinishResult } from './platform/session';
import { activeSession, getMeta, getMission, putSession, setMeta, useDatabase, type Meta } from './platform/store';
import { Collection } from './ui/Collection';
import { Encounter } from './ui/Encounter';
import { MissionMap } from './ui/MissionMap';
import { Onboarding } from './ui/Onboarding';
import { Settings } from './ui/Settings';
import { Today } from './ui/Today';
import { Walking } from './ui/Walking';
import { H1, P, Screen as Page } from './ui/kit';
import { useTheme } from './ui/theme';

export const PACK = packJson as unknown as AreaPack;
const PACK_ERRORS = validatePack(PACK);

type Screen =
  | { name: 'loading' }
  | { name: 'onboarding' }
  | { name: 'today' }
  | { name: 'map'; mission: Mission }
  | { name: 'walking'; ctrl: SessionController }
  | { name: 'encounter'; mission: Mission; result: FinishResult }
  | { name: 'collection' }
  | { name: 'settings' };

type Tab = 'today' | 'collection' | 'settings';
const TABS: { id: Tab; label: string }[] = [{ id: 'today', label: 'Hôm nay' }, { id: 'collection', label: 'Bộ sưu tập' }, { id: 'settings', label: 'Cài đặt' }];

/**
 * Startup: the sim switch lives in the real database; pick the database, prune
 * expired raw logs, then resume an unfinished session if there is one.
 */
async function boot(): Promise<{ sim: boolean; meta: Meta; screen: Screen }> {
  useDatabase(false);
  const real = await getMeta();
  const sim = !!real.simMode;
  await pruneRawLogs(Date.now());
  if (sim) {
    useDatabase(true);
    await pruneRawLogs(Date.now());
    // Simulation always verifies fully; it needs no device check of its own.
    if (!(await getMeta()).onboarded) { await setMeta('onboarded', true); await setMeta('motionAvailable', true); }
  }
  const meta = await getMeta();
  if (!real.onboarded) return { sim, meta, screen: { name: 'onboarding' } };
  const s = await activeSession();
  const mission = s && (await getMission(s.missionId));
  if (s && mission) {
    try {
      return { sim, meta, screen: { name: 'walking', ctrl: await SessionController.recover(PACK, s, mission) } };
    } catch {
      await putSession({ ...s, status: 'failed', endedAt: Date.now(), reasons: ['LONG_GAP'] });
    }
  }
  // A recorder left running without a matching session (e.g. data wiped mid-walk) is stopped.
  const native = walkSensors();
  if (!sim && native?.activeSession() && native.activeSession() !== s?.id) await native.stopSession();
  return { sim, meta, screen: { name: 'today' } };
}

function Shell() {
  const t = useTheme();
  const inset = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [meta, setMetaState] = useState<Meta>({});
  const [sim, setSim] = useState(false);
  const [bootError, setBootError] = useState('');
  const [bootKey, setBootKey] = useState(0);

  const reloadMeta = useCallback(async () => setMetaState(await getMeta()), []);

  useEffect(() => {
    setScreen({ name: 'loading' });
    boot().then((b) => { setSim(b.sim); setMetaState(b.meta); setScreen(b.screen); })
      .catch((e: Error) => setBootError(e.message));
  }, [bootKey]);

  useEffect(() => {
    if (screen.name === 'today' || screen.name === 'collection' || screen.name === 'settings') void reloadMeta();
  }, [screen.name, reloadMeta]);

  // Android back: map → today, tabs → today. Walking keeps the session (back leaves the app, recording continues).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen.name === 'map' || screen.name === 'collection' || screen.name === 'settings' || screen.name === 'encounter') {
        setScreen({ name: 'today' });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen.name]);

  const toggleSim = async () => {
    useDatabase(false);
    await setMeta('simMode', !sim);
    setBootKey((k) => k + 1);
  };

  if (PACK_ERRORS.length) {
    return <Page><H1>Gói khu vực bị lỗi</H1><P>App không dùng gói này để tránh gợi ý địa điểm chưa kiểm tra.</P>{PACK_ERRORS.map((e) => <P key={e} small>• {e}</P>)}</Page>;
  }
  if (bootError) return <Page><H1>Không mở được dữ liệu</H1><P>{bootError}</P></Page>;

  const tab: Tab | null = screen.name === 'today' || screen.name === 'collection' || screen.name === 'settings' ? screen.name : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: inset.top }}>
      <StatusBar barStyle={t.bg === '#fbf7f0' ? 'dark-content' : 'light-content'} />
      {sim && (
        <View testID="sim-banner" style={{ backgroundColor: t.simBg, paddingHorizontal: 16, paddingVertical: 6 }}>
          <Text style={{ color: t.simInk, fontSize: 13 }}>Chế độ mô phỏng: dữ liệu riêng, không tính vào bộ sưu tập thật</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        {screen.name === 'loading' && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.muted }}>Đang tải…</Text></View>}
        {screen.name === 'onboarding' && (
          <Onboarding sim={sim} onDone={async () => {
            // Onboarding writes to the current database; the real one must know too.
            if (sim) { useDatabase(false); await setMeta('onboarded', true); useDatabase(true); }
            await reloadMeta();
            setScreen({ name: 'today' });
          }} />
        )}
        {screen.name === 'today' && <Today pack={PACK} meta={meta} sim={sim} onPick={(mission) => setScreen({ name: 'map', mission })} />}
        {screen.name === 'map' && (
          <MissionMap pack={PACK} mission={screen.mission} meta={meta} sim={sim} onBack={() => setScreen({ name: 'today' })}
            onStarted={(ctrl) => setScreen({ name: 'walking', ctrl })} />
        )}
        {screen.name === 'walking' && (
          <Walking pack={PACK} ctrl={screen.ctrl}
            onClaimed={(result) => { const mission = screen.ctrl.state.mission; screen.ctrl.dispose(); setScreen({ name: 'encounter', mission, result }); }}
            onEnded={() => { screen.ctrl.dispose(); setScreen({ name: 'today' }); }} />
        )}
        {screen.name === 'encounter' && (
          <Encounter pack={PACK} mission={screen.mission} result={screen.result}
            onDone={(to) => setScreen(to === 'today' ? { name: 'today' } : { name: 'collection' })} />
        )}
        {screen.name === 'collection' && <Collection pack={PACK} />}
        {screen.name === 'settings' && (
          <Settings pack={PACK} meta={meta} sim={sim} onChanged={reloadMeta} onToggleSim={() => void toggleSim()}
            onRecheck={() => setScreen({ name: 'onboarding' })} onWiped={() => setBootKey((k) => k + 1)} />
        )}
      </View>
      {tab && (
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingBottom: inset.bottom }}>
          {TABS.map((x) => (
            <Pressable key={x.id} testID={`tab-${x.id}`} accessibilityRole="tab" accessibilityState={{ selected: tab === x.id }} onPress={() => setScreen({ name: x.id } as Screen)}
              style={{ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: tab === x.id ? t.accent : t.muted, fontWeight: tab === x.id ? '700' : '500' }}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export default function App() {
  return <SafeAreaProvider><Shell /></SafeAreaProvider>;
}
