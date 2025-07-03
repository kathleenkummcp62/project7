from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def test_human():
    cmd = ["go", "run", str(ROOT / "aggregator.go"), "-human", "3661"]
    out = subprocess.check_output(cmd)
    assert out.decode().strip() == "01:01:01"
