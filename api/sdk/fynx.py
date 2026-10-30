"""FYNX API client for Python 3.8+. Standard library only.

Never ship an API key to a browser or mobile app; call FYNX from your backend.

    from fynx import Fynx
    fynx = Fynx(os.environ["FYNX_API_KEY"])
    rsi = fynx.indicators("rsi", {"values": [...], "period": 14})["result"]

Spec: https://www.fynxfinanceworld.com/api/openapi.json
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE_URL = "https://us-central1-fynx-c7a28.cloudfunctions.net/developerGateway"


class FynxError(Exception):
    def __init__(self, status, code, message, request_id=None):
        super().__init__(message)
        self.status = status          # HTTP status, e.g. 422
        self.code = code              # e.g. "invalid_input", "permission-denied"
        self.request_id = request_id  # X-Request-Id, when present


class Fynx:
    def __init__(self, api_key, base_url=DEFAULT_BASE_URL, timeout=15, max_retries=2):
        if not re.fullmatch(r"fynx_(test|live)_[a-f0-9]{64}", api_key or ""):
            raise ValueError("Provide a FYNX API key (fynx_test_... or fynx_live_...).")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.propfirm = _PropFirm(self)

    def request(self, method, path, body=None):
        """Low-level request. Retries 429 and 5xx with exponential backoff."""
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    return json.loads(res.read() or b"{}")
            except urllib.error.HTTPError as e:
                try:
                    payload = json.loads(e.read() or b"{}")
                except ValueError:
                    payload = {}
                if (e.code == 429 or e.code >= 500) and attempt < self.max_retries:
                    time.sleep(0.5 * 2 ** attempt)
                    continue
                err = payload.get("error", {})
                raise FynxError(e.code, err.get("code", "http_error"), err.get("message", f"HTTP {e.code}"), e.headers.get("X-Request-Id")) from None

    def risk(self, name, data):
        """position-size, risk-reward, pip-value, margin, break-even, atr-stop"""
        return self.request("POST", f"/v1/risk/{name}", data)

    def indicators(self, name, data):
        """sma, ema, rsi, macd, bollinger, atr, stochastic, vwap, screen"""
        return self.request("POST", f"/v1/indicators/{name}", data)

    def markets(self, name, data=None):
        """status, holidays, sessions, exchanges"""
        return self.request("POST", f"/v1/markets/{name}", data or {})

    def portfolio(self, name, data):
        """performance, drawdown, exposure"""
        return self.request("POST", f"/v1/portfolio/{name}", data)


class _PropFirm:
    """Prop firm rules: rule sets, accounts, events and status."""

    def __init__(self, client):
        self._c = client

    def create_rule_set(self, data):
        return self._c.request("POST", "/v1/propfirm/rule-sets", data)

    def create_account(self, data):
        return self._c.request("POST", "/v1/propfirm/accounts", data)

    def add_event(self, account_id, data):
        return self._c.request("POST", f"/v1/propfirm/accounts/{urllib.parse.quote(account_id)}/events", data)

    def status(self, account_id):
        return self._c.request("GET", f"/v1/propfirm/accounts/{urllib.parse.quote(account_id)}/status")

    def events(self, account_id, before=None, before_id=None):
        q = f"?before={before}&beforeId={urllib.parse.quote(before_id)}" if before else ""
        return self._c.request("GET", f"/v1/propfirm/accounts/{urllib.parse.quote(account_id)}/events{q}")
