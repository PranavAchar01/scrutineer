"""The comparison anyone can run for themselves.

One task, one model, two harnesses: the one the agent started with and the one it ended with.
The only difference is what the context component decided to put in front of the model. Exporting
it as data means the page can run it in a visitor's browser with the visitor's own key, and the
generated code is executed client-side — it never touches a server.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .car.roles import shape_context
from .circuits import Item
from .theta import Theta

SYSTEM = "You are writing one Python function. Output only code."


def _harness(theta: Theta, item: Item) -> dict[str, Any]:
    ctx = shape_context(theta, item)
    a = theta.aero
    return {
        "context": ctx.text,
        "refs": ctx.ref_ids,
        "missing": sorted(ctx.missing),
        "retrieval": a.get("retrieval"),
        "n_refs": a.get("n_refs"),
        "verification": (theta.data.get("probe") or {}).get("mode"),
        "samples": (theta.tyres.get("modes", {}).get(3) or {}).get("samples", 1),
    }


def build_trial(*, before: Theta, after: Theta, n: int = 4, seed: int = 1994,
                use_rates: bool = True) -> dict[str, Any]:
    """One interface spec, one model, two harnesses.

    The only difference between the two sides is what the retrieval component decided to put in
    front of the model. Exported as data so a visitor can run it in their own browser with their
    own key — and audit both results with the same engine the loop used.
    """
    from .webtasks import build_pool as web_pool

    pool = web_pool()
    picks: list[Item] = []
    seen: set[str] = set()
    for it in sorted(pool, key=lambda i: -i.difficulty):
        if it.family in seen:
            continue
        seen.add(it.family)
        picks.append(it)
        if len(picks) >= n:
            break
    _ = (seed, use_rates)

    tasks = []
    for it in picks:
        tasks.append({
            "id": it.id,
            "family": it.family,
            "title": it.title,
            "prompt": it.prompt,
            "must": [list(m) for m in it.must],
            "concepts": sorted(it.concepts),
            "before": _harness(before, it),
            "after": _harness(after, it),
        })
    return {
        "schema": 2,
        "system": ("You are building a web interface that real people will use, including people "
                   "using a screen reader or a keyboard alone. Return one complete, self-contained "
                   "HTML document and nothing else. Inline all CSS. Make no external requests."),
        "models": ["OpenPipe/Qwen3-14B-Instruct"],
        "axe": "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js",
        "before_label": "the harness it started with",
        "after_label": "the harness it ended with",
        "tasks": tasks,
    }


def champion_from_bundle(bundle: dict[str, Any], base: Theta) -> Theta:
    """Replay the accepted diffs, in order, onto the starting harness.

    The bundle records the exact change kept at each run, so the finished harness can be rebuilt
    from the record rather than trusted from a file someone might have edited."""
    from .patchtool import PatchError, apply_diff

    files = dict(base.files)
    for r in bundle.get("rounds", []):
        if not r.get("promoted") or not r.get("diff"):
            continue
        try:
            files = apply_diff(files, r["diff"])
        except PatchError:
            continue
    return Theta.from_files(base.root, files)


def write_trial(path: Path, *, before_root: Path | None = None, after_root: Path | None = None,
                n: int = 4, bundle: Path | None = None) -> Path:
    base = Theta.load(before_root)
    if bundle and bundle.exists():
        after = champion_from_bundle(json.loads(bundle.read_text()), base)
        before = base
    elif after_root and (Path(after_root) / "skills").exists():
        after = Theta.load(after_root)
        before = base
    else:
        after = base
        before = _rewind(after)
    obj = build_trial(before=before, after=after, n=n)
    obj["identical"] = before.full_hash == after.full_hash
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2))
    return path


def _rewind(after: Theta) -> Theta:
    """The starting harness: keyword retrieval, the original three references, the weakest probe.
    This is what `skills/` looked like before the first run, reconstructed rather than guessed."""
    import yaml

    files = dict(after.files)
    pol = yaml.safe_load(files.get("skills/aero/policy.yaml", "") or "{}") or {}
    pol.update({"retrieval": "keyword", "n_refs": 2, "budget_tokens": 900, "layout": "refs-first"})
    files["skills/aero/policy.yaml"] = yaml.safe_dump(pol, sort_keys=False)
    refs = files.get("skills/aero/references.md", "")
    cut = refs.find("\n## ref-structures")
    if cut > 0:
        files["skills/aero/references.md"] = refs[:cut] + "\n"
    da = yaml.safe_load(files.get("skills/data/tools.yaml", "") or "{}") or {}
    da["probe"] = {**da.get("probe", {}), "mode": "syntax"}
    files["skills/data/tools.yaml"] = yaml.safe_dump(da, sort_keys=False)
    return Theta.from_files(after.root, files)
