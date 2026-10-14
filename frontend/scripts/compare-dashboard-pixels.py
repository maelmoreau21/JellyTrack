"""Compare stabilized dashboard viewport captures (requires Pillow)."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageChops

widgets = '--widgets' in sys.argv
root = Path(__file__).resolve().parents[2] / ("scratch/frontend-sveltekit-widget-qa" if widgets else "scratch/frontend-sveltekit-dashboard-qa")
cases = []
for actual_path in sorted(root.glob("svelte-*.png")):
    reference_path = root / actual_path.name.replace("svelte-", "reference-")
    if not reference_path.exists():
        raise RuntimeError(f"Missing reference: {reference_path.name}")
    actual = Image.open(actual_path).convert("RGB")
    reference = Image.open(reference_path).convert("RGB")
    if actual.size != reference.size:
        raise RuntimeError(f"Dimensions differ: {actual_path.name}")
    difference = ImageChops.difference(actual, reference)
    red, green, blue = difference.split()
    intensity = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    count = actual.width * actual.height - intensity.histogram()[0]
    cases.append({"case": actual_path.name, "size": actual.size,
                  "differentPixels": count, "bounds": difference.getbbox()})

expected_count = 36 if widgets else 8
if len(cases) != expected_count:
    raise RuntimeError(f"Expected {expected_count} captured scenarios, got {len(cases)}")
report = {
    "scope": "Dashboard widget elements and viewport" if widgets else "Visible dashboard viewport only, Go develop reference versus Svelte static build",
    "limits": "Mock API, empty chart series; widgets mode uses simulated streams and a fixture-only hardware target. Does not compare old Next/React main or other pages.",
    "cases": cases,
}
(root / "pixel-comparison.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
for case in cases:
    print(f"{case['case']}: {case['differentPixels']} different pixels")
raise SystemExit(1 if any(case["differentPixels"] for case in cases) else 0)
