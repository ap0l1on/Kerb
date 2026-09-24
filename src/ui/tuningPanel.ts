// Dev-only (F2) tuning panel: sliders for every value in tuning.ts + Copy/Reset.
// Excluded from prod builds via import.meta.env.DEV checks at the call site.
import { TUNING, tuningToJson, tuningFromJson } from '../physics/tuning';

export function mountTuningPanel(parent: HTMLElement): void {
  let el = document.getElementById('tuning');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tuning';
    parent.appendChild(el);
  }
  const render = () => {
    const rows = (Object.keys(TUNING) as (keyof typeof TUNING)[])
      .map((k) => {
        const v = TUNING[k];
        const min = Math.min(0, v * 0.2);
        const max = Math.max(v * 2, v + 1);
        return `<label>${k} <input data-k="${k}" type="range" min="${min}" max="${max}" step="any" value="${v}"/><span>${Number(v).toFixed(3)}</span></label>`;
      })
      .join('');
    el!.innerHTML = `<b>TUNING (dev)</b><div>${rows}</div>` +
      `<div class="btn-row"><button data-a="copy">COPY JSON</button><button data-a="reset">RESET</button></div>`;
    el!.querySelectorAll('input[data-k]').forEach((inp) => {
      (inp as HTMLInputElement).oninput = () => {
        const k = (inp as HTMLElement).dataset.k as keyof typeof TUNING;
        (TUNING as unknown as Record<string, number>)[k] = Number((inp as HTMLInputElement).value);
        const span = inp.parentElement?.querySelector('span');
        if (span) span.textContent = Number((inp as HTMLInputElement).value).toFixed(3);
      };
    });
    (el!.querySelector('[data-a="copy"]') as HTMLButtonElement).onclick = () => {
      void navigator.clipboard?.writeText(tuningToJson());
    };
    (el!.querySelector('[data-a="reset"]') as HTMLButtonElement).onclick = () => {
      tuningFromJson(tuningToJson());
      render();
    };
  };
  render();
}

export function toggleTuningPanel(parent: HTMLElement): void {
  let el = document.getElementById('tuning');
  if (!el) {
    mountTuningPanel(parent);
    el = document.getElementById('tuning');
  }
  if (el) el.style.display = el.style.display === 'block' ? 'none' : 'block';
}
