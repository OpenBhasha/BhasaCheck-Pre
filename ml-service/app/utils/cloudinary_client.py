"""Download the original audio (a plain HTTPS Cloudinary URL, so a normal GET
suffices) and upload processed audio back via the Cloudinary Python SDK.
"""
from __future__ import annotations

import cloudinary
import cloudinary.uploader
import requests

from app.config import settings

cloudinary.config(
    cloud_name=settings.cloudinary_cloud_name,
    api_key=settings.cloudinary_api_key,
    api_secret=settings.cloudinary_api_secret,
    secure=True,
)


def download(url: str, dest_path: str) -> None:
    response = requests.get(url, stream=True, timeout=120)
    response.raise_for_status()
    with open(dest_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)


def upload_processed_audio(file_path: str, folder: str) -> dict:
    result = cloudinary.uploader.upload(
        file_path,
        resource_type="video",  # Cloudinary stores audio under the "video" resource type
        folder=folder,
    )
    return {"url": result["secure_url"], "publicId": result["public_id"]}
