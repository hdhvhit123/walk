import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { Creature } from '../core/pack';

/** Simple parametric 2D creature drawing; `hidden` renders a silhouette. */
export function CreatureArt({ creature, size = 120, hidden = false }: { creature: Creature; size?: number; hidden?: boolean }) {
  const { body, accent, shape, feature } = creature.art;
  const b = hidden ? '#2b3440' : body;
  const a = hidden ? '#2b3440' : accent;
  const rx = shape === 'flat' ? 42 : shape === 'tall' ? 30 : 36;
  const ry = shape === 'flat' ? 28 : shape === 'tall' ? 40 : 34;
  const cy = shape === 'flat' ? 70 : 62;
  return (
    <Svg viewBox="0 0 120 120" width={size} height={size} accessibilityLabel={hidden ? 'Sinh vật chưa gặp' : creature.name}>
      <Ellipse cx="60" cy="108" rx="34" ry="6" fill="#000" opacity="0.12" />
      {feature === 'shell' && <Ellipse cx="60" cy={cy - 10} rx="40" ry="26" fill={a} />}
      {feature === 'spiral' && (<G><Circle cx="72" cy={cy - 12} r="22" fill={a} />{!hidden && <Path d={`M72 ${cy - 12} m-12 0 a12 12 0 1 1 12 12 a7 7 0 1 1 -7 -7`} fill="none" stroke={body} strokeWidth="3" />}</G>)}
      {(feature === 'wings' || feature === 'dragonfly') && (
        <G opacity={hidden ? 1 : 0.85}>
          <Ellipse cx="26" cy={cy - 6} rx="20" ry={feature === 'dragonfly' ? 8 : 14} fill={a} transform={`rotate(-20 26 ${cy - 6})`} />
          <Ellipse cx="94" cy={cy - 6} rx="20" ry={feature === 'dragonfly' ? 8 : 14} fill={a} transform={`rotate(20 94 ${cy - 6})`} />
        </G>
      )}
      {feature === 'fins' && (<G><Path d={`M60 ${cy + 30} l-18 14 l36 0 z`} fill={a} /><Path d={`M22 ${cy} l-14 -10 l0 20 z`} fill={a} /><Path d={`M98 ${cy} l14 -10 l0 20 z`} fill={a} /></G>)}
      <Ellipse cx="60" cy={cy} rx={rx} ry={ry} fill={b} />
      {feature === 'cat' && (<G fill={b}><Path d={`M34 ${cy - 22} l6 -22 l14 14 z`} /><Path d={`M86 ${cy - 22} l-6 -22 l-14 14 z`} /></G>)}
      {feature === 'rabbit' && (<G fill={b}><Ellipse cx="46" cy={cy - 42} rx="7" ry="20" /><Ellipse cx="74" cy={cy - 42} rx="7" ry="20" />{!hidden && <><Ellipse cx="46" cy={cy - 42} rx="3" ry="13" fill={accent} /><Ellipse cx="74" cy={cy - 42} rx="3" ry="13" fill={accent} /></>}</G>)}
      {feature === 'horns' && (<G fill={a}><Path d={`M38 ${cy - 26} q-10 -14 2 -20 q-2 10 6 16 z`} /><Path d={`M82 ${cy - 26} q10 -14 -2 -20 q2 10 -6 16 z`} /></G>)}
      {feature === 'owl' && (<G fill={a}><Path d={`M32 ${cy - 26} l4 -14 l10 10 z`} /><Path d={`M88 ${cy - 26} l-4 -14 l-10 10 z`} /></G>)}
      {!hidden && (
        <G>
          {feature === 'owl' ? (
            <><Circle cx="47" cy={cy - 6} r="11" fill="#fff" /><Circle cx="73" cy={cy - 6} r="11" fill="#fff" /><Circle cx="47" cy={cy - 6} r="5" fill="#222" /><Circle cx="73" cy={cy - 6} r="5" fill="#222" /></>
          ) : (
            <><Circle cx="48" cy={cy - 6} r="5" fill="#222" /><Circle cx="72" cy={cy - 6} r="5" fill="#222" /><Circle cx="49.5" cy={cy - 7.5} r="1.6" fill="#fff" /><Circle cx="73.5" cy={cy - 7.5} r="1.6" fill="#fff" /></>
          )}
          <Ellipse cx="40" cy={cy + 6} rx="5" ry="3" fill={accent} opacity="0.45" />
          <Ellipse cx="80" cy={cy + 6} rx="5" ry="3" fill={accent} opacity="0.45" />
          <Path d={`M54 ${cy + 6} q6 6 12 0`} fill="none" stroke="#222" strokeWidth="2" strokeLinecap="round" />
          {feature === 'wings' && creature.id === 'se-den-long' && <Circle cx="60" cy={cy + 18} r="8" fill="#ffe08a" opacity="0.9" />}
        </G>
      )}
    </Svg>
  );
}
