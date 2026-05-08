#!/usr/bin/env python3
"""
PowerShell Script Runner

Wraps the existing PowerShell scripts from aws-exe-dist/scripts for use in Python tests.
"""

import os
import subprocess
import json
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass


@dataclass
class ScriptResult:
    """Result from running a PowerShell script."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class Config:
    """Test configuration loaded from environment or file."""

    def __init__(self, env_file: Optional[str] = None):
        """Load config from env file and/or environment variables."""
        self._load_env_file(env_file)

        self.api_url = os.environ.get("BINDIST_API_URL", "")
        self.tenant_id = os.environ.get("TENANT_ID", "")
        self.api_secret = os.environ.get("API_SECRET", "")
        self.api_key = os.environ.get("API_KEY", "")  # Full API key for single-tenant
        self.scripts_path = os.environ.get("SCRIPTS_PATH", "../../aws-exe-dist/scripts")
        self.provider = os.environ.get("PROVIDER", "aws")
        self.scaleway_gateway_url = os.environ.get("SCALEWAY_GATEWAY_URL", "")

        # Resolve scripts path relative to this file
        if not os.path.isabs(self.scripts_path):
            base_dir = Path(__file__).parent
            self.scripts_path = str((base_dir / self.scripts_path).resolve())

    def _load_env_file(self, env_file: Optional[str] = None):
        """Load environment variables from file."""
        if env_file is None:
            env_file = Path(__file__).parent / "test_config.env"

        if Path(env_file).exists():
            with open(env_file, "r") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, value = line.split("=", 1)
                        os.environ.setdefault(key.strip(), value.strip())

    def validate(self) -> Tuple[bool, str]:
        """Validate the configuration for AWS provider."""
        errors = []
        if not self.api_url:
            errors.append("BINDIST_API_URL is not set")
        # Either need full API_KEY or TENANT_ID + API_SECRET
        if not self.api_key and not (self.tenant_id and self.api_secret):
            errors.append("Either API_KEY or both TENANT_ID and API_SECRET must be set")
        if not Path(self.scripts_path).exists():
            errors.append(f"Scripts path does not exist: {self.scripts_path}")

        if errors:
            return False, "\n".join(errors)
        return True, "Configuration OK"

    def validate_scaleway(self) -> Tuple[bool, str]:
        """Validate the configuration for Scaleway provider."""
        errors = []
        if not self.api_key:
            errors.append("API_KEY is not set (required for Scaleway)")
        if not self.scaleway_gateway_url:
            errors.append("SCALEWAY_GATEWAY_URL is not set")
        if errors:
            return False, "\n".join(errors)
        return True, "Configuration OK"

    @property
    def is_single_tenant(self) -> bool:
        """Check if using single-tenant mode (full API key)."""
        return bool(self.api_key) and not (self.tenant_id and self.api_secret)

    def __str__(self):
        return (
            f"Config(\n"
            f"  api_url={self.api_url}\n"
            f"  tenant_id={self.tenant_id[:8]}...\n"
            f"  api_secret={self.api_secret[:8]}...\n"
            f"  scripts_path={self.scripts_path}\n"
            f")"
        )


class PS1Runner:
    """Runs PowerShell scripts from aws-exe-dist/scripts."""

    def __init__(self, config: Config):
        self.config = config
        self.tenant_scripts = Path(config.scripts_path) / "tenant-scripts"
        self.ci_scripts = Path(config.scripts_path) / "ci-scripts"
        self.admin_scripts = Path(config.scripts_path) / "admin-scripts"

    def _run_ps1(
        self,
        script_path: Path,
        args: Dict[str, Any],
        timeout: int = 60,
    ) -> ScriptResult:
        """Run a PowerShell script with arguments."""
        if not script_path.exists():
            return ScriptResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=f"Script not found: {script_path}",
                error=f"Script not found: {script_path}",
            )

        # Build PowerShell command
        cmd = ["pwsh", "-NoProfile", "-NonInteractive", "-File", str(script_path)]

        # Add common auth args - prefer full ApiKey for single-tenant mode
        if self.config.api_key:
            args.setdefault("ApiKey", self.config.api_key)
        else:
            args.setdefault("TenantId", self.config.tenant_id)
            args.setdefault("Secret", self.config.api_secret)
        args.setdefault("ApiUrl", self.config.api_url)

        # Add all arguments
        for key, value in args.items():
            if value is not None and value != "":
                if isinstance(value, bool):
                    if value:
                        cmd.append(f"-{key}")
                else:
                    cmd.extend([f"-{key}", str(value)])

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "BINDIST_API_URL": self.config.api_url},
            )

            success = result.returncode == 0
            data = None
            error = None

            # Try to parse JSON from stdout if format was json
            if "Format" in args and args["Format"] == "json" and result.stdout.strip():
                try:
                    data = json.loads(result.stdout.strip())
                except json.JSONDecodeError:
                    pass

            if not success:
                error = result.stderr.strip() or result.stdout.strip()

            return ScriptResult(
                success=success,
                exit_code=result.returncode,
                stdout=result.stdout,
                stderr=result.stderr,
                data=data,
                error=error,
            )

        except subprocess.TimeoutExpired:
            return ScriptResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr="Script timed out",
                error="Script timed out",
            )
        except Exception as e:
            return ScriptResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=str(e),
                error=str(e),
            )

    # =========================================================================
    # Tenant Scripts
    # =========================================================================

    def list_applications(
        self,
        search: Optional[str] = None,
        tags: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        format: str = "json",
    ) -> ScriptResult:
        """List applications using List-Applications.ps1."""
        return self._run_ps1(
            self.tenant_scripts / "List-Applications.ps1",
            {
                "Search": search,
                "Tags": tags,
                "Page": page,
                "PageSize": page_size,
                "Format": format,
            },
        )

    def list_versions(
        self,
        application_id: str,
        channel: Optional[str] = None,
        format: str = "json",
    ) -> ScriptResult:
        """List versions using List-Versions.ps1."""
        return self._run_ps1(
            self.tenant_scripts / "List-Versions.ps1",
            {
                "ApplicationId": application_id,
                "Channel": channel,
                "Format": format,
            },
        )

    def download_file(
        self,
        application_id: str,
        version: str,
        output_path: str = ".",
        file_id: Optional[str] = None,
        channel: Optional[str] = None,
        skip_checksum: bool = False,
    ) -> ScriptResult:
        """Download a file using Download-File.ps1."""
        return self._run_ps1(
            self.tenant_scripts / "Download-File.ps1",
            {
                "ApplicationId": application_id,
                "Version": version,
                "OutputPath": output_path,
                "FileId": file_id,
                "Channel": channel,
                "SkipChecksumVerification": skip_checksum,
            },
        )

    def add_customer(
        self,
        name: str,
        tier: str = "Basic",
        parent_customer_id: str = "admin",
        notes: Optional[str] = None,
    ) -> ScriptResult:
        """Create a customer using Add-Customer.ps1."""
        return self._run_ps1(
            self.tenant_scripts / "Add-Customer.ps1",
            {
                "Name": name,
                "Tier": tier,
                "ParentCustomerId": parent_customer_id,
                "Notes": notes,
            },
        )

    def add_application(
        self,
        application_id: str,
        name: str,
        customer_ids: str,
        description: Optional[str] = None,
        tags: Optional[str] = None,
    ) -> ScriptResult:
        """Create an application using Add-Application.ps1."""
        return self._run_ps1(
            self.tenant_scripts / "Add-Application.ps1",
            {
                "ApplicationId": application_id,
                "Name": name,
                "CustomerIds": customer_ids,
                "Description": description,
                "Tags": tags,
            },
        )

    def new_share_link(
        self,
        application_id: str,
        version: str,
        file_id: Optional[str] = None,
        expires_in_minutes: int = 30,
        format: str = "json",
    ) -> ScriptResult:
        """Create a share link using New-ShareLink.ps1."""
        return self._run_ps1(
            self.tenant_scripts / "New-ShareLink.ps1",
            {
                "ApplicationId": application_id,
                "Version": version,
                "FileId": file_id,
                "ExpiresInMinutes": expires_in_minutes,
                "Format": format,
            },
        )

    # =========================================================================
    # CI Scripts
    # =========================================================================

    def upload_application(
        self,
        application_id: str,
        version: str,
        file_path: str,
        release_notes: Optional[str] = None,
    ) -> ScriptResult:
        """Upload an application using Upload-Application.ps1."""
        return self._run_ps1(
            self.ci_scripts / "Upload-Application.ps1",
            {
                "ApplicationId": application_id,
                "Version": version,
                "FilePath": file_path,
                "ReleaseNotes": release_notes,
            },
            timeout=300,  # Longer timeout for uploads
        )


def get_runner(env_file: Optional[str] = None) -> Tuple[PS1Runner, Config]:
    """Get a configured runner instance."""
    config = Config(env_file)
    return PS1Runner(config), config


if __name__ == "__main__":
    # Test the configuration
    config = Config()
    valid, msg = config.validate()
    print(f"Config validation: {msg}")
    print(config)
