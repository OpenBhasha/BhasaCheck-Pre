from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

VALID_PAYLOAD = {
    "taskId": "task-1",
    "datasetId": "dataset-1",
    "audioUrl": "https://example.com/audio.wav",
    "language": "en",
    "callbackUrl": "http://backend/api/internal/datasets/dataset-1/stage",
    "callbackSecret": "test-secret",
}


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_pipeline_process_rejects_missing_secret():
    response = client.post("/pipeline/process", json=VALID_PAYLOAD)
    assert response.status_code == 401


def test_pipeline_process_rejects_wrong_secret():
    response = client.post(
        "/pipeline/process", json=VALID_PAYLOAD, headers={"X-Internal-Secret": "wrong"}
    )
    assert response.status_code == 401


def test_pipeline_process_success(mocker):
    mocker.patch("app.api.routes.run_pipeline", return_value=None)

    response = client.post(
        "/pipeline/process", json=VALID_PAYLOAD, headers={"X-Internal-Secret": "test-secret"}
    )

    assert response.status_code == 200
    assert response.json() == {"status": "completed", "error": None}


def test_pipeline_process_reports_failure_without_500(mocker):
    mocker.patch("app.api.routes.run_pipeline", side_effect=RuntimeError("demucs exploded"))

    response = client.post(
        "/pipeline/process", json=VALID_PAYLOAD, headers={"X-Internal-Secret": "test-secret"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "failed"
    assert "demucs exploded" in body["error"]
