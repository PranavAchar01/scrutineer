"""The gates. A promotion has to pass every one of them, and each says why in its own words."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any

from .regs import Regs


@dataclass
class Gate:
    name: str
    ok: bool
    detail: str
    value: Any = None

    def row(self) -> dict[str, Any]:
        return {"gate": self.name, "ok": self.ok, "detail": self.detail, "value": self.value}


def seesaw(regs: Regs, d_quali: float, d_sealed: float) -> Gate:
    """Seconds gained on both circuits, strictly better on at least one."""
    ok = d_quali >= 0 and d_sealed >= 0 and max(d_quali, d_sealed) > 0
    return Gate("seesaw", ok,
                f"TEAM CLAIMED {d_quali:+.3f}s, OFFICIAL {d_sealed:+.3f}s"
                + ("" if ok else " — a gain on one circuit only counts if the other did not go backwards"),
                {"d_quali": round(d_quali, 3), "d_sealed": round(d_sealed, 3)})


def correlation(regs: Regs, d_smoke: float, d_quali: float, d_sealed: float) -> Gate:
    band = float(regs.g("gates", "correlation_dead_band_s"))
    signs = {int(math.copysign(1, d)) for d in (d_smoke, d_quali, d_sealed) if abs(d) > band}
    ok = not (1 in signs and -1 in signs)
    return Gate("correlation", ok,
                f"smoke {d_smoke:+.3f}s, quali {d_quali:+.3f}s, sealed {d_sealed:+.3f}s "
                f"(dead band {band}s)" + ("" if ok else " — correlation problem, credited to DATA"),
                {"d_smoke": round(d_smoke, 3), "d_quali": round(d_quali, 3),
                 "d_sealed": round(d_sealed, 3)})


def regression(prev: dict[str, bool], new: dict[str, bool],
               new_any: dict[str, bool] | None = None) -> Gate:
    """Preserve-and-extend. An item counts as lost when it passed every trial before and now
    fails every trial; one flapping trial is noise, not a regression."""
    survives = new_any if new_any is not None else new
    lost = sorted(k for k, v in prev.items() if v and not survives.get(k, False))
    return Gate("regression", not lost,
                "no item that passed last generation now fails" if not lost
                else f"{len(lost)} item(s) regressed: {lost[:5]}", {"lost": lost})


def cost(regs: Regs, spent_usd: float) -> Gate:
    cap = regs.race_cap_usd
    return Gate("cost_cap", spent_usd <= cap, f"${spent_usd:.3f} of ${cap:.2f} race + replay budget",
                {"spent": round(spent_usd, 4), "cap": cap})


def verdict_gate(regs: Regs, verdict: str, confidence: float, unattended: bool) -> Gate:
    if verdict == "LEGAL":
        return Gate("scrutineering", True, f"LEGAL at {confidence:.2f}", {"verdict": verdict})
    if verdict == "BLACK_FLAG":
        return Gate("scrutineering", False, f"BLACK FLAG at {confidence:.2f}", {"verdict": verdict})
    return Gate("scrutineering", False,
                "REFERRED TO THE STEWARDS" + (" — parked until an attended generation" if unattended
                                              else " — needs the Team Principal"),
                {"verdict": verdict})


def diff_size(regs: Regs, lines: int) -> Gate:
    n = int(regs.g("gates", "min_diff_lines"))
    return Gate("diff_size", lines >= n, f"{lines} changed line(s), minimum {n}", {"lines": lines})


def comparable_ab(a_diff: str, b_diff: str) -> Gate:
    ok = a_diff.strip() != b_diff.strip()
    return Gate("comparable_ab", ok,
                "two comparable candidates" if ok else "A and B are the same change", None)


def _tokens(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9_]{3,}", s.lower()))


def novelty(regs: Regs, diff_text: str, history: list[str]) -> Gate:
    eta = float(regs.g("gates", "novelty_cosine"))
    a = _tokens(diff_text)
    worst = 0.0
    for h in history:
        b = _tokens(h)
        if not a or not b:
            continue
        cos = len(a & b) / math.sqrt(len(a) * len(b))
        worst = max(worst, cos)
    return Gate("novelty", worst < eta,
                f"closest previous proposal cosine {worst:.3f} (reject at {eta})", {"cosine": round(worst, 3)})


def evidence(pages_cited: list[str]) -> Gate:
    return Gate("evidence", bool(pages_cited),
                f"cites {len(pages_cited)} pattern page(s)" if pages_cited
                else "no pattern page cited", {"pages": pages_cited})


def entropy(regs: Regs, entropy_series: list[float]) -> Gate:
    """A POWER UNIT candidate whose entropy has collapsed cannot enter the seesaw."""
    if len(entropy_series) < 6:
        return Gate("rl_entropy", True, "no RL job this generation", None)
    ratio = float(regs.g("gates", "entropy_collapse_ratio"))
    first = entropy_series[0] or 1e-9
    last5 = sum(entropy_series[-5:]) / 5
    ok = last5 >= ratio * first
    return Gate("rl_entropy", ok,
                f"entropy {last5:.4f} vs {ratio:.0%} of step-0 {first:.4f}"
                + ("" if ok else " — the engine failed the dyno"), {"ratio": round(last5 / first, 3)})


def summarise(gates: list[Gate]) -> tuple[bool, list[str]]:
    failed = [g.name for g in gates if not g.ok]
    return (not failed, failed)
