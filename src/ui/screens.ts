// Menus, track select, pause, finish, settings, how-to. Plain DOM, no framework.
import { NAME } from '../config';
import { TRACKS } from '../tracks/index';
import { formatTime, MEDAL_EMOJI, type MedalId } from '../game/medals';
import { groupUnlocked, type Progress } from '../game/progress';
import { DEFAULT_BINDINGS, type KeyBindings } from '../core/input';

export interface FinishData {
  time: number;
  isPB: boolean;
  deltaBest: number | null;
  medal: MedalId;
  medalLabel: string;
  nextLabel: string;
}

export class Screens {
  root: HTMLElement;
  toastEl: HTMLElement;
  sel = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'screens';
    parent.appendChild(this.root);
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    parent.appendChild(this.toastEl);
  }

  clear(): void {
    this.root.innerHTML = '';
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    window.setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, 2600);
  }

  private shell(title: string, body: string): HTMLElement {
    this.clear();
    const s = document.createElement('div');
    s.className = 'screen';
    s.innerHTML = `<div class="panel"><div class="kerb-stripe"></div><h2>${title}</h2><div class="sbody"></div></div>`;
    this.root.appendChild(s);
    const b = s.querySelector('.sbody') as HTMLElement;
    b.innerHTML = body;
    return b;
  }

  showTitle(cb: { play: () => void; settings: () => void; howto: () => void }): void {
    this.clear();
    const s = document.createElement('div');
    s.className = 'screen';
    s.innerHTML =
      `<div class="wordmark">${NAME}<div class="stripe"></div></div>` +
      `<p style="color:var(--muted)">Short, fast tracks. Instant restart. Beat your ghost.</p>` +
      `<div class="btn-row" style="justify-content:center">` +
      `<button class="primary" data-a="play">PLAY</button>` +
      `<button data-a="settings">SETTINGS</button>` +
      `<button data-a="howto">HOW TO PLAY</button></div>` +
      `<p style="color:var(--muted);font-size:13px;margin-top:18px">` +
      `<a style="color:var(--muted)" href="https://github.com/ap0l1on/kerb">GitHub</a> · Made with Three.js · Leaderboards later</p>`;
    this.root.appendChild(s);
    const q = (a: string) => s.querySelector(`[data-a="${a}"]`) as HTMLButtonElement;
    q('play').onclick = cb.play;
    q('settings').onclick = cb.settings;
    q('howto').onclick = cb.howto;
    q('play').focus();
  }

  showTrackSelect(p: Progress, cb: { race: (id: string, author: boolean) => void; back: () => void }): void {
    const groups: { id: 'rookie' | 'pro' | 'elite'; label: string; need: string }[] = [
      { id: 'rookie', label: 'ROOKIE', need: '' },
      { id: 'pro', label: 'PRO', need: 'Bronze on all Rookie' },
      { id: 'elite', label: 'ELITE', need: 'Gold on 3 Pro' },
    ];
    const mini = TRACKS.map((t) => ({ id: t.id, group: t.group }));
    const open = (g: string) => groupUnlocked(g as 'rookie' | 'pro' | 'elite', p, mini);
    let html = '';
    const flat: { id: string; locked: boolean }[] = [];
    for (const g of groups) {
      html += `<div class="group-label">${g.label}${open(g.id) ? '' : ` · 🔒 ${g.need}`}</div><div class="cards">`;
      for (const t of TRACKS.filter((t) => t.group === g.id)) {
        const locked = !open(g.id);
        flat.push({ id: t.id, locked });
        const pr = p.tracks[t.id];
        const best = pr?.best != null ? formatTime(pr.best) : '—';
        const med = pr?.medal ? (MEDAL_EMOJI[pr.medal] ?? '') : '';
        const thumb = `${import.meta.env.BASE_URL}thumbs/${t.id}.png`;
        html += `<div class="card${locked ? ' locked' : ''}" data-id="${t.id}" tabindex="0">` +
          `<img alt="" loading="lazy" src="${locked ? '' : thumb}"/>` +
          `<div class="t">${locked ? '🔒 ' : ''}${t.name} ${med}</div>` +
          `<div class="m">${t.theme} · best ${best}</div></div>`;
      }
      html += `</div>`;
    }
    html += `<div class="btn-row"><button data-a="back">BACK</button></div>
      <div id="cardinfo" style="color:var(--muted);font-size:13px;margin-top:8px"></div>`;
    const b = this.shell(`${NAME} · TRACKS`, html);
    (b.querySelector('[data-a="back"]') as HTMLButtonElement).onclick = cb.back;
    const cards = [...b.querySelectorAll('.card')] as HTMLElement[];
    const info = b.querySelector('#cardinfo') as HTMLElement;
    const select = (idx: number) => {
      this.sel = (idx + flat.length) % flat.length;
      cards.forEach((c, i) => c.classList.toggle('selected', i === this.sel));
      const f = flat[this.sel]!;
      const t = TRACKS.find((t) => t.id === f.id)!;
      info.innerHTML = f.locked ? `Locked — finish the previous group first.` :
        `${t.name} · 🥉 ${formatTime(t.medals.bronze)} · 🥈 ${formatTime(t.medals.silver)} · 🥇 ${formatTime(t.medals.gold)} · ◆ ${formatTime(t.medals.author)} ` +
        `<button data-race="${t.id}" style="padding:6px 14px;font-size:14px">RACE</button> ` +
        `<button data-author="${t.id}" style="padding:6px 14px;font-size:14px">RACE THE AUTHOR</button>`;
      const rb = info.querySelector('[data-race]') as HTMLButtonElement | null;
      if (rb) rb.onclick = () => cb.race(t.id, false);
      const ab = info.querySelector('[data-author]') as HTMLButtonElement | null;
      if (ab) ab.onclick = () => cb.race(t.id, true);
      cards[this.sel]?.scrollIntoView({ block: 'nearest' });
    };
    cards.forEach((c, i) => {
      c.onclick = () => {
        const f = flat[i]!;
        if (!f.locked) {
          select(i);
          cb.race(f.id, false);
        }
      };
      c.onmouseenter = () => select(i);
    });
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.code === 'ArrowRight') select(this.sel + 1);
      else if (e.code === 'ArrowLeft') select(this.sel - 1);
      else if (e.code === 'ArrowDown') select(this.sel + 4);
      else if (e.code === 'ArrowUp') select(this.sel - 4);
      else if (e.code === 'Enter') {
        const f = flat[this.sel]!;
        if (f && !f.locked) cb.race(f.id, false);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', this.keyHandler);
    select(Math.min(this.sel, flat.length - 1));
  }

  showPause(cb: { resume: () => void; restart: () => void; tracks: () => void; settings: () => void }): void {
    const b = this.shell('PAUSED',
      `<div class="btn-row"><button class="primary" data-a="resume">RESUME</button>` +
      `<button data-a="restart">RESTART (R)</button><button data-a="tracks">TRACK SELECT</button>` +
      `<button data-a="settings">SETTINGS</button></div>`);
    (b.querySelector('[data-a="resume"]') as HTMLButtonElement).onclick = cb.resume;
    (b.querySelector('[data-a="restart"]') as HTMLButtonElement).onclick = cb.restart;
    (b.querySelector('[data-a="tracks"]') as HTMLButtonElement).onclick = cb.tracks;
    (b.querySelector('[data-a="settings"]') as HTMLButtonElement).onclick = cb.settings;
  }

  showFinish(d: FinishData, cb: { retry: () => void; next: () => void; replay: () => void; share: () => void; challenge: () => void; tracks: () => void }): void {
    const medalShow = d.medal ? `<div class="medal-drop">${MEDAL_EMOJI[d.medal] ?? ''} ${d.medalLabel}</div>` : `<div style="color:var(--muted)">No medal yet</div>`;
    const b = this.shell('FINISH',
      `<div id="finish"><div class="big num">${formatTime(d.time)}</div>` +
      `<div>${d.isPB ? '<b style="color:var(--ahead)">NEW BEST!</b>' : d.deltaBest != null ? `Best ${formatTime(d.deltaBest)} (${d.deltaBest < d.time ? '+' : ''}${(d.time - d.deltaBest).toFixed(3)})` : ''}</div>` +
      `${medalShow}<div style="color:var(--muted);font-size:14px">${d.nextLabel}</div>` +
      `<div class="btn-row"><button class="primary" data-a="retry">RETRY (R)</button>` +
      `<button data-a="next">NEXT TRACK</button><button data-a="replay">WATCH REPLAY</button>` +
      `<button data-a="share">SHARE</button><button data-a="challenge">CHALLENGE A FRIEND</button>` +
      `<button data-a="tracks">TRACKS</button></div></div>`);
    const q = (a: string) => b.querySelector(`[data-a="${a}"]`) as HTMLButtonElement;
    q('retry').onclick = cb.retry;
    q('next').onclick = cb.next;
    q('replay').onclick = cb.replay;
    q('share').onclick = cb.share;
    q('challenge').onclick = cb.challenge;
    q('tracks').onclick = cb.tracks;
    q('retry').focus();
  }

  showReplayBar(cb: { exit: () => void; speed: (s: number) => void; scrub: (f: number) => void }): void {
    this.clear();
    const s = document.createElement('div');
    s.className = 'screen';
    s.style.justifyContent = 'flex-end';
    s.style.pointerEvents = 'none';
    s.innerHTML = `<div class="panel" style="pointer-events:auto;display:flex;gap:8px;align-items:center">` +
      `<button data-a="exit">EXIT</button><button data-s="0.5">0.5×</button>` +
      `<button data-s="1">1×</button><button data-s="2">2×</button>` +
      `<input data-r="seek" type="range" min="0" max="1000" value="0" style="flex:1"/></div>`;
    this.root.appendChild(s);
    (s.querySelector('[data-a="exit"]') as HTMLButtonElement).onclick = cb.exit;
    s.querySelectorAll('[data-s]').forEach((el) => {
      (el as HTMLButtonElement).onclick = () => cb.speed(Number((el as HTMLElement).dataset.s));
    });
    (s.querySelector('[data-r="seek"]') as HTMLInputElement).oninput = (e) => {
      cb.scrub(Number((e.target as HTMLInputElement).value) / 1000);
    };
  }

  showSettings(p: Progress, cb: { change: () => void; back: () => void; reset: () => void }): void {
    const s = p.settings;
    const b = this.shell(`${NAME} · SETTINGS`,
      `<div class="btn-row" style="margin-top:0">
        <button data-tab="g">GRAPHICS</button><button data-tab="c">CONTROLS</button>
        <button data-tab="a">AUDIO</button><button data-tab="m">GAME</button>
        <button data-a="back">BACK</button></div><div id="tab"></div>`);
    (b.querySelector('[data-a="back"]') as HTMLButtonElement).onclick = cb.back;
    const tab = b.querySelector('#tab') as HTMLElement;
    const graphics = () => {
      tab.innerHTML =
        `Quality: <button data-q="low">LOW</button> <button data-q="medium">MED</button> <button data-q="high">HIGH</button><br/><br/>` +
        `<label>Render scale <input data-k="renderScale" type="range" min="0.5" max="1" step="0.05" value="${s.renderScale}"/></label><br/>` +
        `<label>FOV offset <input data-k="fovOffset" type="range" min="-5" max="10" step="1" value="${s.fovOffset}"/></label><br/>` +
        `<label><input data-k="showFps" type="checkbox" ${s.showFps ? 'checked' : ''}/> Show FPS (F3)</label>` +
        `<div id="adapt" style="color:var(--muted);font-size:12px"></div>`;
      tab.querySelectorAll('[data-q]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          s.quality = (el as HTMLElement).dataset.q as 'low' | 'medium' | 'high';
          cb.change();
        };
      });
      tab.querySelectorAll('[data-k]').forEach((el) => {
        (el as HTMLInputElement).oninput = () => {
          const k = (el as HTMLElement).dataset.k!;
          const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : Number((el as HTMLInputElement).value);
          (s as unknown as Record<string, unknown>)[k] = v;
          cb.change();
        };
      });
    };
    const controls = () => {
      const bindings: KeyBindings = { ...(s.bindings as unknown as KeyBindings | null ?? {}), ...DEFAULT_BINDINGS, ...(s.bindings ?? {}) } as KeyBindings;
      const rows = (Object.keys(DEFAULT_BINDINGS) as (keyof KeyBindings)[])
        .map((k) => `<div><button data-k="${k}">${k}: ${(bindings[k] as string) ?? ''}</button></div>`).join('');
      tab.innerHTML = `${rows}<br/><label>Steering sensitivity <input data-k="sensitivity" type="range" min="0.5" max="2" step="0.1" value="${s.sensitivity}"/></label>
        <div style="color:var(--muted);font-size:12px">Click a button, then press a key. Conflicts are highlighted.</div>`;
      tab.querySelectorAll('[data-k]').forEach((el) => {
        const k = (el as HTMLElement).dataset.k!;
        if (k === 'sensitivity') {
          (el as HTMLInputElement).oninput = () => {
            s.sensitivity = Number((el as HTMLInputElement).value);
            cb.change();
          };
          return;
        }
        (el as HTMLButtonElement).onclick = () => {
          (el as HTMLButtonElement).textContent = `${k}: press a key…`;
          const h = (e: KeyboardEvent) => {
            e.preventDefault();
            const cur = { ...(s.bindings ?? {}) } as Record<string, string>;
            cur[k] = e.code;
            // conflict highlight
            const seen = new Set<string>();
            let conflict = false;
            for (const v of Object.values({ ...DEFAULT_BINDINGS, ...cur })) {
              if (seen.has(v)) conflict = true;
              seen.add(v);
            }
            s.bindings = cur;
            window.removeEventListener('keydown', h, true);
            cb.change();
            controls();
            if (conflict) this.toast('Key conflict — two actions share a key');
          };
          window.addEventListener('keydown', h, true);
        };
      });
    };
    const audio = () => {
      tab.innerHTML =
        `<label>Master <input data-k="master" type="range" min="0" max="1" step="0.05" value="${s.master}"/></label><br/>` +
        `<label>Engine <input data-k="engine" type="range" min="0" max="1" step="0.05" value="${s.engine}"/></label><br/>` +
        `<label>SFX <input data-k="sfx" type="range" min="0" max="1" step="0.05" value="${s.sfx}"/></label>`;
      tab.querySelectorAll('[data-k]').forEach((el) => {
        (el as HTMLInputElement).oninput = () => {
          const k = (el as HTMLElement).dataset.k as 'master' | 'engine' | 'sfx';
          s[k] = Number((el as HTMLInputElement).value);
          cb.change();
        };
      });
    };
    const game = () => {
      tab.innerHTML =
        `Units: <button data-u="kmh">km/h</button> <button data-u="mph">mph</button><br/><br/>` +
        `<label><input data-k="ghostOn" type="checkbox" ${s.ghostOn ? 'checked' : ''}/> Ghost on by default</label><br/><br/>` +
        `<button data-a="reset" style="border-color:var(--behind)">RESET ALL PROGRESS</button>`;
      tab.querySelectorAll('[data-u]').forEach((el) => {
        (el as HTMLButtonElement).onclick = () => {
          s.units = (el as HTMLElement).dataset.u as 'kmh' | 'mph';
          cb.change();
        };
      });
      (tab.querySelector('[data-k="ghostOn"]') as HTMLInputElement).onchange = (e) => {
        s.ghostOn = (e.target as HTMLInputElement).checked;
        cb.change();
      };
      (tab.querySelector('[data-a="reset"]') as HTMLButtonElement).onclick = () => {
        if (window.confirm('Reset all progress?')) cb.reset();
      };
    };
    b.querySelectorAll('[data-tab]').forEach((el) => {
      (el as HTMLButtonElement).onclick = () => {
        const t = (el as HTMLElement).dataset.tab;
        if (t === 'g') graphics();
        else if (t === 'c') controls();
        else if (t === 'a') audio();
        else game();
      };
    });
    graphics();
  }

  showHowto(back: () => void): void {
    const b = this.shell('HOW TO PLAY',
      `<p><b>W/↑</b> accelerate · <b>S/↓</b> brake/reverse · <b>A D/← →</b> steer<br/>` +
      `<b>R</b> instant restart · <b>Enter</b> back to checkpoint · <b>Esc</b> pause · <b>C</b> camera · <b>G</b> ghost · <b>F3</b> FPS</p>` +
      `<p>3 tips: <b>R restarts instantly</b> · <b>Brake + steer to drift</b> · <b>Hit every checkpoint</b>.</p>` +
      `<div class="btn-row"><button data-a="back">BACK</button></div>`);
    (b.querySelector('[data-a="back"]') as HTMLButtonElement).onclick = back;
  }

  showGate(): void {
    let g = document.getElementById('gate');
    if (!g) {
      g = document.createElement('div');
      g.id = 'gate';
      document.body.appendChild(g);
    }
    g.style.display = 'flex';
    g.innerHTML = `<div><div class="wordmark">${NAME}<div class="stripe"></div></div>` +
      `<p>Kerb is made for keyboards. Open it on a computer.</p></div>`;
  }
}
