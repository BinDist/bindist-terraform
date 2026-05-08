#!/usr/bin/env python3
"""
BinDist API Test Runner

Runs test scenarios against the BinDist API using the PowerShell scripts.

Usage:
    ./run_tests.py                      # Run all scenarios
    ./run_tests.py connectivity         # Run specific scenario
    ./run_tests.py --list               # List available scenarios
    ./run_tests.py --config my.env      # Use custom config file

Environment:
    Set these in test_config.env or as environment variables:
    - BINDIST_API_URL: API endpoint URL
    - TENANT_ID: Your tenant UUID
    - API_SECRET: Your API secret
"""

import argparse
import sys
import time
from typing import List

from ps1_runner import Config, PS1Runner
from scaleway_runner import ScalewayRunner
from test_scenarios import (
    ALL_SCENARIOS,
    TestContext,
    TestResult,
    cleanup_context,
)


# ANSI colors
class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    END = "\033[0m"


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'=' * 60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{text}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'=' * 60}{Colors.END}\n")


def print_result(result: TestResult):
    status = f"{Colors.GREEN}PASS{Colors.END}" if result.passed else f"{Colors.RED}FAIL{Colors.END}"
    duration = f"{result.duration:.2f}s"
    print(f"  [{status}] {result.name} ({duration})")
    if result.message:
        print(f"         {result.message}")
    if not result.passed and result.details:
        for line in result.details.split("\n")[:5]:
            print(f"         {Colors.RED}{line}{Colors.END}")


def run_scenario(name: str, ctx: TestContext) -> List[TestResult]:
    """Run a single scenario."""
    if name not in ALL_SCENARIOS:
        print(f"{Colors.RED}Unknown scenario: {name}{Colors.END}")
        return []

    scenario = ALL_SCENARIOS[name]
    print_header(f"Scenario: {scenario.name}")
    print(f"Description: {scenario.description}\n")

    results = scenario.run(ctx)

    for result in results:
        print_result(result)

    return results


def print_summary(all_results: List[TestResult]):
    """Print test summary."""
    total = len(all_results)
    passed = sum(1 for r in all_results if r.passed)
    failed = total - passed
    total_time = sum(r.duration for r in all_results)

    print_header("Test Summary")
    print(f"  Total tests:  {total}")
    print(f"  {Colors.GREEN}Passed:{Colors.END}       {passed}")
    print(f"  {Colors.RED}Failed:{Colors.END}       {failed}")
    print(f"  Total time:   {total_time:.2f}s")
    print()

    if failed > 0:
        print(f"{Colors.RED}FAILED{Colors.END}")
        return 1
    else:
        print(f"{Colors.GREEN}ALL TESTS PASSED{Colors.END}")
        return 0


def list_scenarios():
    """List all available scenarios."""
    print_header("Available Test Scenarios")
    for name, scenario in ALL_SCENARIOS.items():
        print(f"  {Colors.CYAN}{name}{Colors.END}")
        print(f"    {scenario.description}")
        print(f"    Tests: {len(scenario.tests)}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="BinDist API Test Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "scenarios",
        nargs="*",
        help="Scenarios to run (default: all)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List available scenarios",
    )
    parser.add_argument(
        "--config",
        help="Path to config file (default: test_config.env)",
    )
    parser.add_argument(
        "--provider",
        choices=["aws", "scaleway"],
        default=None,
        help="Cloud provider (auto-detected from config if not specified)",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Verbose output",
    )
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Skip cleanup of test resources (useful for debugging)",
    )

    args = parser.parse_args()

    if args.list:
        list_scenarios()
        return 0

    # Load configuration
    print_header("BinDist API Test Runner")

    try:
        config = Config(args.config)

        # Determine provider
        provider = args.provider or getattr(config, "provider", "aws")

        if provider == "scaleway":
            valid, msg = config.validate_scaleway()
            if not valid:
                print(f"{Colors.RED}Configuration error:{Colors.END}")
                print(msg)
                return 1
            print(f"Provider:     Scaleway")
            print(f"Gateway URL:  {config.scaleway_gateway_url}")
            print(f"API Key:      {config.api_key[:12]}...")
        else:
            valid, msg = config.validate()
            if not valid:
                print(f"{Colors.RED}Configuration error:{Colors.END}")
                print(msg)
                print(f"\nCopy test_config.env.example to test_config.env and fill in your values.")
                return 1
            print(f"Provider:     AWS")
            print(f"API URL:      {config.api_url}")
            print(f"Tenant ID:    {config.tenant_id[:8]}...")
            print(f"Scripts Path: {config.scripts_path}")

    except Exception as e:
        print(f"{Colors.RED}Failed to load configuration: {e}{Colors.END}")
        return 1

    if provider == "scaleway":
        runner = ScalewayRunner(config)
    else:
        # Check PowerShell is available
        import subprocess
        try:
            result = subprocess.run(
                ["pwsh", "--version"],
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise Exception("pwsh returned non-zero")
            print(f"PowerShell:   {result.stdout.strip()}")
        except Exception:
            print(f"{Colors.RED}PowerShell Core (pwsh) is required but not found.{Colors.END}")
            print("Install from: https://github.com/PowerShell/PowerShell")
            return 1
        runner = PS1Runner(config)

    # Create context
    ctx = TestContext(runner=runner, config=config)

    # Determine which scenarios to run
    scenarios_to_run = args.scenarios if args.scenarios else list(ALL_SCENARIOS.keys())

    # Run scenarios
    all_results = []
    try:
        for scenario_name in scenarios_to_run:
            results = run_scenario(scenario_name, ctx)
            all_results.extend(results)

            # Stop if critical test failed
            if any(not r.passed for r in results):
                failed_test = next(r for r in results if not r.passed)
                if hasattr(ALL_SCENARIOS[scenario_name].tests[0], "critical"):
                    print(f"\n{Colors.YELLOW}Stopping due to critical test failure{Colors.END}")
                    break

    finally:
        # Cleanup
        if args.no_cleanup:
            print(f"\n{Colors.YELLOW}Skipping cleanup (--no-cleanup specified){Colors.END}")
            if ctx.created_applications:
                print(f"  Applications: {ctx.created_applications}")
        else:
            cleanup_context(ctx)

    # Print summary
    return print_summary(all_results)


if __name__ == "__main__":
    sys.exit(main())
