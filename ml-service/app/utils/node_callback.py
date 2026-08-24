"""Posts per-stage progress/results back to Node's internal API so Dataset
stays up to date throughout a run rather than only once the whole pipeline
finishes. Never raises on a callback failure — losing a progress update
must not abort an otherwise-successful pipeline run.
"""
from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger(__name__)


def post_stage_update(callback_url: str, callback_secret: str, payload: dict[str, Any]) -> None:
    try:
        response = requests.post(
            callback_url,
            json=payload,
            headers={"X-Internal-Secret": callback_secret},
            timeout=30,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to post stage update (%s): %s", payload.get("stage"), exc)
