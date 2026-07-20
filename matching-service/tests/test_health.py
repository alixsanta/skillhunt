def test_health_status_200(client):
    response = client.get("/health")
    assert response.status_code == 200


def test_health_payload(client):
    response = client.get("/health")
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "matching-service"


def test_health_content_type(client):
    response = client.get("/health")
    assert "application/json" in response.headers["content-type"]
