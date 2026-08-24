import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

# Loads ml-service/.env into the process environment. Must run before the
# os.environ.get(...) defaults below are evaluated, since those are
# dataclass field defaults computed once at class-definition time.
load_dotenv()


@dataclass(frozen=True)
class Settings:
    internal_service_secret: str = os.environ.get("INTERNAL_SERVICE_SECRET", "dev-internal-secret")

    cloudinary_cloud_name: str = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    cloudinary_api_key: str = os.environ.get("CLOUDINARY_API_KEY", "")
    cloudinary_api_secret: str = os.environ.get("CLOUDINARY_API_SECRET", "")

    work_dir: str = os.environ.get("ML_WORK_DIR", "/tmp/rsml-ml")

    device: str = os.environ.get("ML_DEVICE", "cpu")  # "cpu" or "cuda"

    demucs_model: str = os.environ.get("DEMUCS_MODEL", "htdemucs")
    whisper_model: str = os.environ.get("WHISPER_MODEL", "small")
    pyannote_pipeline: str = os.environ.get(
        "PYANNOTE_PIPELINE", "pyannote/speaker-diarization-community-1"
    )
    huggingface_token: str = os.environ.get("HUGGINGFACE_TOKEN", "")

    indic_conformer_model_path: str = os.environ.get("INDIC_CONFORMER_MODEL_PATH", "")
    nemo_model_path: str = os.environ.get("NEMO_MODEL_PATH", "")

    # Languages that should route to IndicConformer when its model path is
    # configured; falls back to Whisper otherwise.
    indic_languages: tuple = field(default_factory=lambda: ("hi", "te"))


settings = Settings()
