"""Compare the complete captures for a converted page with its Go reference."""
import json
from pathlib import Path
import sys
from PIL import Image, ImageChops

suite = sys.argv[1]
expected = {"backups": 8, "accounts": 16, "users": 4}[suite]
root = Path(__file__).resolve().parents[2] / f"scratch/frontend-sveltekit-{suite}-qa"
results = json.loads((root / "results.json").read_text(encoding="utf-8"))
if len(results["cases"]) != expected or not all(case["passed"] for case in results["cases"]):
    raise RuntimeError("Presentation suite did not complete successfully")
cases = []
for actual_path in sorted(root.glob("svelte-*.png")):
    reference_path = root / actual_path.name.replace("svelte-", "reference-", 1)
    with Image.open(actual_path) as image:
        actual = image.convert("RGB")
    with Image.open(reference_path) as image:
        reference = image.convert("RGB")
    if actual.size != reference.size:
        raise RuntimeError(f"Dimensions differ: {actual_path.name}")
    difference = ImageChops.difference(actual, reference)
    red, green, blue = difference.split()
    intensity = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    count = actual.width * actual.height - intensity.histogram()[0]
    cases.append({"case": actual_path.name, "differentPixels": count, "bounds": difference.getbbox()})
expected_captures = expected * 2 if suite == "users" else expected
if len(cases) != expected_captures:
    raise RuntimeError(f"Expected {expected_captures} captures, got {len(cases)}")
(root / "pixel-comparison.json").write_text(json.dumps({"limits": results["limits"], "cases": cases}, indent=2), encoding="utf-8")
print(f"{suite}: {len(cases)} captures, {sum(case['differentPixels'] for case in cases)} different pixels")
raise SystemExit(1 if any(case["differentPixels"] for case in cases) else 0)
