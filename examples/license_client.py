"""License check client for apps that use the Lemon Squeezy License API.

Python 3.8+ (desktop apps, CLIs, PyInstaller builds). Standard library only. MIT licence.

Why: when Lemon Squeezy stops (March 31, 2027) every copy that hard-codes
api.lemonsqueezy.com stops validating. Ship this pattern now:
  1. the base URL comes from config, so a later release (or a remote
     setting you control) can move license checks without new logic;
  2. a grace period, so a network error or an outage never locks out a
     paying user who validated recently.

Usage:
    from license_client import LicenseClient
    lc = LicenseClient(store_path="/path/to/license.json")
    lc.activate("KEY", "My Laptop")      # once
    result = lc.check()                  # on every start: {"valid": bool, "offline": bool}
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


class LicenseClient:
    def __init__(
        self,
        store_path,
        base_url="https://api.lemonsqueezy.com/v1/licenses",  # change in one place
        grace_days=14,
        timeout=8,
        expected_product_id=None,  # reject keys from other products in your store
    ):
        self.store_path = store_path
        self.base_url = base_url.rstrip("/")
        self.grace_seconds = grace_days * 86400
        self.timeout = timeout
        self.expected_product_id = expected_product_id

    def _post(self, action, fields):
        req = urllib.request.Request(
            f"{self.base_url}/{action}",
            data=urllib.parse.urlencode(fields).encode(),
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            # 4xx with a JSON body is a real answer (invalid key etc.); 5xx is an outage.
            if e.code >= 500:
                raise ConnectionError(f"license server {e.code}") from e
            return json.loads(e.read().decode() or "{}")

    def _product_ok(self, data):
        if self.expected_product_id is None:
            return True
        return (data.get("meta") or {}).get("product_id") == self.expected_product_id

    def _load(self):
        try:
            with open(self.store_path, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError):
            return None

    def _save(self, state):
        fd = os.open(self.store_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(state, f)

    def activate(self, license_key, instance_name):
        data = self._post("activate", {"license_key": license_key, "instance_name": instance_name})
        if not data.get("activated") or not self._product_ok(data):
            return {"ok": False, "error": data.get("error") or "This key is not for this product."}
        # Keep instance id: validate/deactivate need it, and a replacement
        # server must import it for existing activations to survive.
        self._save({"license_key": license_key, "instance_id": data["instance"]["id"], "last_valid_at": time.time()})
        return {"ok": True}

    def check(self):
        s = self._load()
        if not s or not s.get("license_key"):
            return {"valid": False, "offline": False}
        try:
            data = self._post("validate", {"license_key": s["license_key"], "instance_id": s.get("instance_id", "")})
        except (OSError, ValueError):
            # Network error, timeout or 5xx: trust a recent successful check.
            return {"valid": time.time() - s.get("last_valid_at", 0) < self.grace_seconds, "offline": True}
        valid = bool(data.get("valid")) and self._product_ok(data)
        self._save({**s, "last_valid_at": time.time() if valid else 0})
        return {"valid": valid, "offline": False}

    def deactivate(self):
        s = self._load()
        if not s or not s.get("license_key"):
            return {"ok": True}
        data = self._post("deactivate", {"license_key": s["license_key"], "instance_id": s.get("instance_id", "")})
        if data.get("deactivated"):
            self._save({})
        return {"ok": bool(data.get("deactivated"))}
