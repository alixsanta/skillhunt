def test_match_stub_returns_200_and_empty_list(client):
    payload = {
        "freelance_id": "123e4567-e89b-12d3-a456-426614174000",
        "skills": ["drone-dgac", "fpv"],
        "location": [43.6, 1.44],
        "radius_km": 50.0,
    }
    response = client.post("/match", json=payload)
    assert response.status_code == 200
    assert response.json() == []


def test_match_rejects_missing_body(client):
    response = client.post("/match", json={})
    assert response.status_code == 422


def test_match_rejects_empty_skills(client):
    payload = {
        "freelance_id": "123e4567-e89b-12d3-a456-426614174000",
        "skills": [],
        "location": [43.6, 1.44],
        "radius_km": 50.0,
    }
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_negative_radius(client):
    payload = {
        "freelance_id": "123e4567-e89b-12d3-a456-426614174000",
        "skills": ["fpv"],
        "location": [43.6, 1.44],
        "radius_km": -1.0,
    }
    response = client.post("/match", json=payload)
    assert response.status_code == 422
