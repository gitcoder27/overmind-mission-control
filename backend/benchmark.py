#!/usr/bin/env python3
"""Benchmark script for Overmind Mission Control backend latency.

Measures single-request and concurrent-request latencies for the three
critical dashboard endpoints.

Usage:
    # Against default local server (http://127.0.0.1:8788)
    python3 benchmark.py

    # Against a custom host
    python3 benchmark.py --base-url http://localhost:9000

    # With more concurrency levels
    python3 benchmark.py --concurrency 1,2,5,10,20

Output: plain-text report with p50/p95/p99 latencies.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import urlopen, Request
from urllib.error import URLError


ENDPOINTS = [
    ("/api/v1/system/snapshot", "snapshot"),
    ("/api/v1/agents/overmind-oracle/files", "agent_files"),
    ("/api/v1/agents/overmind-oracle/files/agents", "agent_file_content"),
]


def fetch(url: str, timeout: float = 30.0) -> tuple[float, int]:
    """GET *url* and return (elapsed_seconds, status_code)."""
    t0 = time.monotonic()
    try:
        req = Request(url)
        resp = urlopen(req, timeout=timeout)
        _ = resp.read()
        elapsed = time.monotonic() - t0
        return elapsed, resp.status
    except URLError as e:
        elapsed = time.monotonic() - t0
        return elapsed, getattr(e, "code", 0) or 0


def percentile(data: list[float], pct: float) -> float:
    """Return the *pct*-th percentile of *data*."""
    if not data:
        return 0.0
    k = (len(data) - 1) * (pct / 100.0)
    f = int(k)
    c = f + 1
    if c >= len(data):
        return data[f]
    return data[f] + (k - f) * (data[c] - data[f])


def run_sequential(base_url: str, n: int = 5) -> dict:
    """Run N sequential requests per endpoint and report latencies."""
    results = {}
    for path, label in ENDPOINTS:
        url = base_url + path
        times = []
        for _ in range(n):
            elapsed, status = fetch(url)
            times.append(elapsed)
        times.sort()
        results[label] = {
            "times": times,
            "p50": percentile(times, 50),
            "p95": percentile(times, 95),
            "p99": percentile(times, 99),
            "mean": statistics.mean(times),
            "min": min(times),
            "max": max(times),
        }
    return results


def run_concurrent(base_url: str, concurrency: int, n_per_worker: int = 3) -> dict:
    """Run concurrent requests and report aggregate latency per endpoint."""
    results = {}
    for path, label in ENDPOINTS:
        url = base_url + path
        times = []
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            futures = []
            for _ in range(concurrency * n_per_worker):
                futures.append(pool.submit(fetch, url))
            for f in as_completed(futures):
                elapsed, status = f.result()
                times.append(elapsed)
        times.sort()
        results[label] = {
            "concurrency": concurrency,
            "total_requests": len(times),
            "p50": percentile(times, 50),
            "p95": percentile(times, 95),
            "p99": percentile(times, 99),
            "mean": statistics.mean(times),
            "min": min(times),
            "max": max(times),
        }
    return results


def run_mixed_concurrent(base_url: str, concurrency: int) -> dict:
    """Run concurrent requests across ALL endpoints simultaneously."""
    url_label_pairs = [(base_url + path, label) for path, label in ENDPOINTS]
    all_times: dict[str, list[float]] = {label: [] for _, label in url_label_pairs}

    with ThreadPoolExecutor(max_workers=concurrency * len(ENDPOINTS)) as pool:
        futures = {}
        for url, label in url_label_pairs:
            for _ in range(concurrency):
                f = pool.submit(fetch, url)
                futures[f] = label
        for f in as_completed(futures):
            elapsed, status = f.result()
            all_times[futures[f]].append(elapsed)

    results = {}
    for label, times in all_times.items():
        times.sort()
        results[label] = {
            "concurrency": concurrency,
            "p50": percentile(times, 50),
            "p95": percentile(times, 95),
            "max": max(times),
        }
    return results


def print_report(title: str, data: dict):
    """Pretty-print a benchmark section."""
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")
    for label, metrics in data.items():
        print(f"\n  {label}:")
        for k, v in metrics.items():
            if k == "times":
                continue
            if isinstance(v, float):
                print(f"    {k:>12}: {v:.3f}s")
            else:
                print(f"    {k:>12}: {v}")


def check_targets(seq_results: dict, conc_results: dict) -> list[str]:
    """Check results against acceptance targets and return violations."""
    violations = []

    snap_seq = seq_results.get("snapshot", {})
    if snap_seq.get("p50", 99) > 1.0:
        violations.append(f"FAIL: snapshot p50 = {snap_seq['p50']:.3f}s (target <1.0s)")

    for conc_data in conc_results.values():
        snap = conc_data.get("snapshot", {})
        c = snap.get("concurrency", 0)
        if c >= 5 and snap.get("p95", 99) > 2.0:
            violations.append(
                f"FAIL: snapshot p95 @ {c} concurrency = {snap['p95']:.3f}s (target <2.0s)"
            )
        for endpoint in ["agent_files", "agent_file_content"]:
            ep = conc_data.get(endpoint, {})
            if ep.get("p95", 99) > 2.0:
                violations.append(
                    f"FAIL: {endpoint} p95 @ {c} concurrency = {ep['p95']:.3f}s (target <2.0s)"
                )

    return violations


def main():
    parser = argparse.ArgumentParser(description="Benchmark Overmind API latency")
    parser.add_argument("--base-url", default="http://127.0.0.1:8788")
    parser.add_argument("--concurrency", default="1,3,5",
                        help="Comma-separated concurrency levels")
    parser.add_argument("--sequential-n", type=int, default=5,
                        help="Number of sequential requests per endpoint")
    parser.add_argument("--json", action="store_true",
                        help="Output results as JSON")
    args = parser.parse_args()

    conc_levels = [int(x) for x in args.concurrency.split(",")]

    # Verify server is reachable
    try:
        elapsed, status = fetch(args.base_url + "/")
        if status == 0:
            print(f"ERROR: Cannot reach {args.base_url}")
            sys.exit(1)
        print(f"Server reachable at {args.base_url} ({elapsed:.3f}s, status={status})")
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    # Warm-up
    print("Warming up caches...")
    for path, _ in ENDPOINTS:
        fetch(args.base_url + path)

    # Sequential
    print(f"\nRunning {args.sequential_n} sequential requests per endpoint...")
    seq_results = run_sequential(args.base_url, n=args.sequential_n)
    print_report("Sequential Requests", seq_results)

    # Concurrent
    conc_results = {}
    for c in conc_levels:
        print(f"\nRunning concurrency={c} requests...")
        conc_results[c] = run_concurrent(args.base_url, concurrency=c)
        print_report(f"Concurrent (n={c})", conc_results[c])

    # Mixed concurrent
    print(f"\nRunning mixed-endpoint concurrent test (n=5)...")
    mixed = run_mixed_concurrent(args.base_url, concurrency=5)
    print_report("Mixed Concurrent (5 per endpoint)", mixed)

    # Target check
    print(f"\n{'=' * 60}")
    print("  Acceptance Target Check")
    print(f"{'=' * 60}")
    violations = check_targets(seq_results, conc_results)
    if violations:
        for v in violations:
            print(f"  {v}")
    else:
        print("  ALL TARGETS MET ✓")

    # JSON output
    if args.json:
        output = {
            "sequential": seq_results,
            "concurrent": {str(k): v for k, v in conc_results.items()},
            "mixed": mixed,
            "violations": violations,
        }
        # Clean up non-serialisable bits
        for label in output["sequential"]:
            output["sequential"][label].pop("times", None)
        print(f"\n{json.dumps(output, indent=2)}")

    sys.exit(1 if violations else 0)


if __name__ == "__main__":
    main()
