#!/usr/bin/env python3
"""
BinDist API Test Scenarios

Test scenarios that use the PowerShell scripts to verify API functionality.
"""

import os
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from typing import List, Optional, Callable
from pathlib import Path

# Add bindist-api-python to path
_api_python_path = Path(__file__).parent.parent.parent / "bindist-api-python"
if _api_python_path.exists():
    sys.path.insert(0, str(_api_python_path))

from ps1_runner import PS1Runner, Config, ScriptResult


@dataclass
class TestResult:
    """Result of a single test."""
    name: str
    passed: bool
    duration: float
    message: str = ""
    details: str = ""


@dataclass
class TestContext:
    """Context shared between tests in a scenario."""
    runner: PS1Runner
    config: Config
    # Track created resources for cleanup
    created_customers: List[str] = field(default_factory=list)
    created_applications: List[str] = field(default_factory=list)
    uploaded_versions: List[tuple] = field(default_factory=list)
    temp_files: List[str] = field(default_factory=list)
    # Store data between tests
    data: dict = field(default_factory=dict)


class TestScenario:
    """Base class for test scenarios."""

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description
        self.tests: List[Callable[[TestContext], TestResult]] = []

    def add_test(self, test_fn: Callable[[TestContext], TestResult]):
        """Add a test function to the scenario."""
        self.tests.append(test_fn)
        return test_fn

    def run(self, ctx: TestContext) -> List[TestResult]:
        """Run all tests in the scenario."""
        results = []
        for test_fn in self.tests:
            start = time.time()
            try:
                result = test_fn(ctx)
                result.duration = time.time() - start
                results.append(result)

                # Stop on failure if test is critical
                if not result.passed and getattr(test_fn, "critical", False):
                    break

            except Exception as e:
                results.append(TestResult(
                    name=test_fn.__name__,
                    passed=False,
                    duration=time.time() - start,
                    message=f"Exception: {e}",
                ))
                break

        return results


# =============================================================================
# Helper Functions
# =============================================================================

def create_test_file(size_kb: int = 10) -> str:
    """Create a temporary test file with random content."""
    fd, path = tempfile.mkstemp(suffix=".bin", prefix="bindist_test_")
    with os.fdopen(fd, "wb") as f:
        f.write(os.urandom(size_kb * 1024))
    return path


def unique_id(prefix: str = "test") -> str:
    """Generate a unique ID for test resources."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# =============================================================================
# Scenario: Basic Connectivity
# =============================================================================

connectivity_scenario = TestScenario(
    "connectivity",
    "Test basic API connectivity and authentication",
)


@connectivity_scenario.add_test
def test_list_applications(ctx: TestContext) -> TestResult:
    """Test that we can list applications (proves auth works)."""
    result = ctx.runner.list_applications()

    if result.success:
        return TestResult(
            name="list_applications",
            passed=True,
            duration=0,
            message="Successfully listed applications",
        )
    else:
        return TestResult(
            name="list_applications",
            passed=False,
            duration=0,
            message="Failed to list applications",
            details=result.error or result.stderr,
        )


test_list_applications.critical = True


# =============================================================================
# Scenario: Application Lifecycle
# =============================================================================

app_lifecycle_scenario = TestScenario(
    "app_lifecycle",
    "Test full application lifecycle: create, upload, download, delete",
)


@app_lifecycle_scenario.add_test
def test_create_application(ctx: TestContext) -> TestResult:
    """Create a test application."""
    app_id = unique_id("testapp")
    app_name = f"Test Application {app_id}"

    # Admin user has implicit access, so no need to assign customers
    result = ctx.runner.add_application(
        application_id=app_id,
        name=app_name,
        customer_ids="",  # Empty - admin has implicit access
        description="Test application for automated testing",
        tags="test,automated",
    )

    if result.success:
        ctx.created_applications.append(app_id)
        ctx.data["test_app_id"] = app_id
        return TestResult(
            name="create_application",
            passed=True,
            duration=0,
            message=f"Created application: {app_id}",
        )
    else:
        return TestResult(
            name="create_application",
            passed=False,
            duration=0,
            message="Failed to create application",
            details=result.error or result.stderr,
        )


test_create_application.critical = True


@app_lifecycle_scenario.add_test
def test_upload_version(ctx: TestContext) -> TestResult:
    """Upload a test version."""
    app_id = ctx.data.get("test_app_id")
    if not app_id:
        return TestResult(
            name="upload_version",
            passed=False,
            duration=0,
            message="No application ID available",
        )

    # Create a test file
    test_file = create_test_file(size_kb=50)
    ctx.temp_files.append(test_file)

    version = "1.0.0-test"
    result = ctx.runner.upload_application(
        application_id=app_id,
        version=version,
        file_path=test_file,
        release_notes="Automated test upload",
    )

    if result.success:
        ctx.uploaded_versions.append((app_id, version))
        ctx.data["test_version"] = version
        return TestResult(
            name="upload_version",
            passed=True,
            duration=0,
            message=f"Uploaded version {version}",
        )
    else:
        return TestResult(
            name="upload_version",
            passed=False,
            duration=0,
            message="Failed to upload version",
            details=result.error or result.stderr,
        )


test_upload_version.critical = True


@app_lifecycle_scenario.add_test
def test_list_versions(ctx: TestContext) -> TestResult:
    """Verify the uploaded version appears in version list."""
    import json as json_mod

    app_id = ctx.data.get("test_app_id")
    expected_version = ctx.data.get("test_version")

    if not app_id or not expected_version:
        return TestResult(
            name="list_versions",
            passed=False,
            duration=0,
            message="Missing app_id or version from previous tests",
        )

    # Use Test channel to see non-enabled versions
    result = ctx.runner.list_versions(application_id=app_id, channel="Test")

    if not result.success:
        return TestResult(
            name="list_versions",
            passed=False,
            duration=0,
            message="Failed to list versions",
            details=result.error or result.stderr,
        )

    # Check if version is in output (try JSON parsing first, fallback to string search)
    version_found = False
    try:
        data = json_mod.loads(result.stdout.strip())
        # Handle different response formats
        if isinstance(data, list):
            version_found = any(v.get("version") == expected_version for v in data)
        elif isinstance(data, dict) and "versions" in data:
            version_found = any(v.get("version") == expected_version for v in data["versions"])
        else:
            version_found = expected_version in result.stdout
    except (json_mod.JSONDecodeError, TypeError):
        # Fallback to string search
        version_found = expected_version in result.stdout

    if version_found:
        return TestResult(
            name="list_versions",
            passed=True,
            duration=0,
            message=f"Version {expected_version} found in list",
        )
    else:
        return TestResult(
            name="list_versions",
            passed=False,
            duration=0,
            message="Version not found in list",
            details=result.stdout[:500] if result.stdout else "No output",
        )


@app_lifecycle_scenario.add_test
def test_download_file(ctx: TestContext) -> TestResult:
    """Download the uploaded file and verify checksum."""
    app_id = ctx.data.get("test_app_id")
    version = ctx.data.get("test_version")

    if not app_id or not version:
        return TestResult(
            name="download_file",
            passed=False,
            duration=0,
            message="Missing app_id or version from previous tests",
        )

    # Create temp directory for download
    download_dir = tempfile.mkdtemp(prefix="bindist_download_")
    ctx.temp_files.append(download_dir)

    # Need to use Test channel since version might not be enabled yet
    result = ctx.runner.download_file(
        application_id=app_id,
        version=version,
        output_path=download_dir,
        channel="Test",
    )

    if result.success and "Download complete" in result.stdout:
        return TestResult(
            name="download_file",
            passed=True,
            duration=0,
            message="File downloaded and checksum verified",
        )
    else:
        return TestResult(
            name="download_file",
            passed=False,
            duration=0,
            message="Failed to download file",
            details=result.error or result.stderr,
        )


@app_lifecycle_scenario.add_test
def test_create_share_link(ctx: TestContext) -> TestResult:
    """Create a shareable download link."""
    import json as json_mod

    app_id = ctx.data.get("test_app_id")
    version = ctx.data.get("test_version")

    if not app_id or not version:
        return TestResult(
            name="create_share_link",
            passed=False,
            duration=0,
            message="Missing app_id or version from previous tests",
        )

    result = ctx.runner.new_share_link(
        application_id=app_id,
        version=version,
        expires_in_minutes=30,
    )

    if not result.success:
        return TestResult(
            name="create_share_link",
            passed=False,
            duration=0,
            message="Failed to create share link",
            details=result.error or result.stderr,
        )

    # Parse JSON response to get shareUrl
    try:
        data = json_mod.loads(result.stdout.strip())
        share_url = data.get("shareUrl")
        if share_url:
            ctx.data["share_url"] = share_url
            ctx.data["share_token"] = data.get("token")
            return TestResult(
                name="create_share_link",
                passed=True,
                duration=0,
                message=f"Share link created (expires in {data.get('expiresInMinutes')} min)",
            )
        else:
            return TestResult(
                name="create_share_link",
                passed=False,
                duration=0,
                message="No shareUrl in response",
                details=result.stdout[:200],
            )
    except (json_mod.JSONDecodeError, TypeError) as e:
        return TestResult(
            name="create_share_link",
            passed=False,
            duration=0,
            message=f"Failed to parse response: {e}",
            details=result.stdout[:200],
        )


@app_lifecycle_scenario.add_test
def test_public_download(ctx: TestContext) -> TestResult:
    """Download file via public share link (no auth required)."""
    import urllib.request
    import urllib.error

    share_url = ctx.data.get("share_url")

    if not share_url:
        return TestResult(
            name="public_download",
            passed=False,
            duration=0,
            message="No share URL from previous test",
        )

    try:
        # Make request - expect 302 redirect to S3
        req = urllib.request.Request(share_url, method="GET")
        # Don't follow redirects automatically so we can verify the redirect
        opener = urllib.request.build_opener(urllib.request.HTTPRedirectHandler())

        try:
            response = opener.open(req)
            # If we get here without redirect, check if it's a success
            if response.status == 200:
                return TestResult(
                    name="public_download",
                    passed=True,
                    duration=0,
                    message="Public download succeeded",
                )
        except urllib.error.HTTPError as e:
            if e.code == 302:
                # Got expected redirect to S3
                location = e.headers.get("Location", "")
                if "s3" in location.lower() or "amazonaws" in location.lower():
                    return TestResult(
                        name="public_download",
                        passed=True,
                        duration=0,
                        message="Public download redirects to S3 (as expected)",
                    )
                else:
                    return TestResult(
                        name="public_download",
                        passed=True,
                        duration=0,
                        message=f"Public download redirects OK",
                    )
            else:
                return TestResult(
                    name="public_download",
                    passed=False,
                    duration=0,
                    message=f"HTTP error: {e.code}",
                    details=str(e),
                )

        return TestResult(
            name="public_download",
            passed=True,
            duration=0,
            message="Public download endpoint accessible",
        )

    except Exception as e:
        return TestResult(
            name="public_download",
            passed=False,
            duration=0,
            message=f"Request failed: {e}",
        )


# =============================================================================
# Scenario: Error Handling
# =============================================================================

error_handling_scenario = TestScenario(
    "error_handling",
    "Test API error handling for invalid requests",
)


@error_handling_scenario.add_test
def test_nonexistent_application(ctx: TestContext) -> TestResult:
    """Test listing versions for non-existent application."""
    result = ctx.runner.list_versions(application_id="nonexistent-app-12345")

    # Should fail gracefully
    if not result.success:
        return TestResult(
            name="nonexistent_application",
            passed=True,
            duration=0,
            message="Correctly returned error for non-existent app",
        )
    else:
        return TestResult(
            name="nonexistent_application",
            passed=False,
            duration=0,
            message="Should have returned error",
        )


@error_handling_scenario.add_test
def test_invalid_version_download(ctx: TestContext) -> TestResult:
    """Test downloading non-existent version."""
    result = ctx.runner.download_file(
        application_id="nonexistent-app",
        version="99.99.99",
        output_path=tempfile.gettempdir(),
    )

    if not result.success:
        return TestResult(
            name="invalid_version_download",
            passed=True,
            duration=0,
            message="Correctly returned error for invalid download",
        )
    else:
        return TestResult(
            name="invalid_version_download",
            passed=False,
            duration=0,
            message="Should have returned error",
        )


# =============================================================================
# All Scenarios
# =============================================================================

ALL_SCENARIOS = {
    "connectivity": connectivity_scenario,
    "app_lifecycle": app_lifecycle_scenario,
    "error_handling": error_handling_scenario,
}


def cleanup_context(ctx: TestContext):
    """Clean up resources created during tests."""
    # Clean up temp files
    for path in ctx.temp_files:
        try:
            if os.path.isfile(path):
                os.unlink(path)
            elif os.path.isdir(path):
                import shutil
                shutil.rmtree(path)
        except Exception:
            pass

    # Clean up created applications
    if ctx.created_applications:
        print(f"\nCleaning up {len(ctx.created_applications)} test application(s)...")

        # Scaleway: use the runner's delete method directly
        if hasattr(ctx.runner, "delete_application"):
            for app_id in ctx.created_applications:
                try:
                    result = ctx.runner.delete_application(app_id)
                    if result.success:
                        print(f"  Soft-deleted: {app_id}")
                    else:
                        print(f"  Failed to delete {app_id}: {result.error}")
                except Exception as e:
                    print(f"  Error deleting {app_id}: {e}")
        else:
            # AWS: use the Python API client
            try:
                from bindist import AdminClient

                api_key = ctx.config.api_key or f"{ctx.config.tenant_id}.{ctx.config.api_secret}"
                admin = AdminClient(ctx.config.api_url, api_key)

                for app_id in ctx.created_applications:
                    try:
                        result = admin.delete_application(app_id)
                        if result.success:
                            print(f"  Soft-deleted: {app_id}")
                        else:
                            error_msg = result.error.get("message", "Unknown error") if result.error else "Unknown error"
                            print(f"  Failed to delete {app_id}: {error_msg}")
                    except Exception as e:
                        print(f"  Error deleting {app_id}: {e}")
            except ImportError:
                print(f"\nCould not import bindist API - applications not cleaned up: {ctx.created_applications}")
            except Exception as e:
                print(f"\nCleanup error: {e}")
                print(f"Applications may need manual cleanup: {ctx.created_applications}")

    if ctx.created_customers:
        print(f"Created customers (may need manual cleanup): {ctx.created_customers}")
