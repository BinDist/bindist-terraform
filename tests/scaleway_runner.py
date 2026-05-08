#!/usr/bin/env python3
"""
Scaleway API Gateway Test Runner

Makes HTTP calls to the single Scaleway API gateway function endpoint.
Drop-in replacement for PS1Runner when testing against Scaleway.
"""

import base64
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional, Dict, Any

from ps1_runner import Config, ScriptResult


class ScalewayRunner:
    """Runs tests against Scaleway API gateway via direct HTTP calls."""

    def __init__(self, config: Config):
        self.config = config
        self.gateway_url = getattr(config, "scaleway_gateway_url", "").rstrip("/")
        self._ssl_ctx = ssl.create_default_context()

    def _request(
        self,
        method: str = "GET",
        path: str = "/",
        query_params: Dict[str, Any] = None,
        body: dict = None,
        headers: Dict[str, str] = None,
        timeout: int = 60,
        auth: bool = True,
    ) -> ScriptResult:
        """Make an HTTP request to the API gateway."""
        url = self.gateway_url + path

        if query_params:
            filtered = {k: str(v) for k, v in query_params.items() if v is not None}
            if filtered:
                url += "?" + urllib.parse.urlencode(filtered)

        req_headers = {}
        if auth and self.config.api_key:
            req_headers["Authorization"] = f"Bearer {self.config.api_key}"
        if headers:
            req_headers.update(headers)

        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=req_headers, method=method)

        try:
            response = urllib.request.urlopen(req, timeout=timeout, context=self._ssl_ctx)
            response_body = response.read().decode("utf-8")

            parsed = None
            stdout = response_body
            if response_body.strip():
                try:
                    parsed = json.loads(response_body)
                    if isinstance(parsed, dict) and "data" in parsed and "success" in parsed:
                        parsed = parsed["data"]
                        stdout = json.dumps(parsed)
                except json.JSONDecodeError:
                    pass

            return ScriptResult(
                success=True,
                exit_code=0,
                stdout=stdout,
                stderr="",
                data=parsed,
            )

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            error_msg = error_body
            try:
                err_data = json.loads(error_body)
                if isinstance(err_data, dict) and "error" in err_data:
                    error_msg = err_data["error"].get("message", error_body)
            except (json.JSONDecodeError, AttributeError):
                pass
            return ScriptResult(
                success=False,
                exit_code=1,
                stdout=error_body,
                stderr=f"HTTP {e.code}: {e.reason}",
                error=error_msg,
            )
        except Exception as e:
            return ScriptResult(
                success=False,
                exit_code=1,
                stdout="",
                stderr=str(e),
                error=str(e),
            )

    # =========================================================================
    # API Methods (same interface as PS1Runner)
    # =========================================================================

    def list_applications(
        self,
        search: Optional[str] = None,
        tags: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        format: str = "json",
    ) -> ScriptResult:
        """List applications."""
        return self._request(
            method="GET",
            path="/v1/applications",
            query_params={"page": page, "limit": page_size, "search": search, "tags": tags},
        )

    def list_versions(
        self,
        application_id: str,
        channel: Optional[str] = None,
        format: str = "json",
    ) -> ScriptResult:
        """List versions for an application."""
        headers = {}
        if channel:
            headers["X-Channel"] = channel
        app_id = urllib.parse.quote(application_id, safe="")
        return self._request(
            method="GET",
            path=f"/v1/applications/{app_id}/versions",
            headers=headers,
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
        """Get download URL and download the file."""
        headers = {}
        if channel:
            headers["X-Channel"] = channel

        result = self._request(
            method="GET",
            path="/v1/downloads/url",
            query_params={
                "applicationId": application_id,
                "version": version,
                "fileId": file_id,
            },
            headers=headers,
        )

        if not result.success or not result.data:
            return result

        download_url = result.data.get("downloadUrl") or result.data.get("url")
        if not download_url:
            return ScriptResult(
                success=False,
                exit_code=1,
                stdout=result.stdout,
                stderr="No download URL in response",
                error="No download URL in response",
            )

        try:
            file_name = result.data.get("fileName", "download.bin")
            output_file = os.path.join(output_path, file_name)
            urllib.request.urlretrieve(download_url, output_file)
            return ScriptResult(
                success=True,
                exit_code=0,
                stdout=f"Download complete: {output_file}",
                stderr="",
            )
        except Exception as e:
            return ScriptResult(
                success=False,
                exit_code=1,
                stdout="",
                stderr=str(e),
                error=str(e),
            )

    def add_application(
        self,
        application_id: str,
        name: str,
        customer_ids: str,
        description: Optional[str] = None,
        tags: Optional[str] = None,
    ) -> ScriptResult:
        """Create an application."""
        body: Dict[str, Any] = {
            "applicationId": application_id,
            "name": name,
        }
        if description:
            body["description"] = description
        if tags:
            body["tags"] = [t.strip() for t in tags.split(",") if t.strip()]
        if customer_ids:
            body["customerIds"] = [c.strip() for c in customer_ids.split(",") if c.strip()]

        return self._request(method="POST", path="/v1/management/applications", body=body)

    def upload_application(
        self,
        application_id: str,
        version: str,
        file_path: str,
        release_notes: Optional[str] = None,
    ) -> ScriptResult:
        """Upload a binary file for an application version."""
        with open(file_path, "rb") as f:
            file_content = base64.b64encode(f.read()).decode("ascii")

        body: Dict[str, Any] = {
            "applicationId": application_id,
            "version": version,
            "fileName": os.path.basename(file_path),
            "fileContent": file_content,
        }
        if release_notes:
            body["releaseNotes"] = release_notes

        return self._request(
            method="POST",
            path="/v1/management/upload",
            body=body,
            timeout=300,
        )

    def new_share_link(
        self,
        application_id: str,
        version: str,
        file_id: Optional[str] = None,
        expires_in_minutes: int = 30,
        format: str = "json",
    ) -> ScriptResult:
        """Create a shareable download link."""
        body: Dict[str, Any] = {
            "applicationId": application_id,
            "version": version,
            "expiresInMinutes": expires_in_minutes,
        }
        if file_id:
            body["fileId"] = file_id

        return self._request(method="POST", path="/v1/downloads/share", body=body)

    def add_customer(
        self,
        name: str,
        tier: str = "Basic",
        parent_customer_id: str = "admin",
        notes: Optional[str] = None,
    ) -> ScriptResult:
        """Create a customer (not used in current tests)."""
        return ScriptResult(
            success=False,
            exit_code=1,
            stdout="",
            stderr="add_customer not implemented for Scaleway runner",
            error="add_customer not implemented for Scaleway runner",
        )

    def delete_application(self, application_id: str) -> ScriptResult:
        """Delete an application (for cleanup)."""
        app_id = urllib.parse.quote(application_id, safe="")
        return self._request(
            method="DELETE",
            path=f"/v1/management/applications/{app_id}",
        )
