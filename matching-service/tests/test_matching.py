BASE_PAYLOAD = {
    "skills": ["drone-dgac", "fpv"],
    "location": [43.6, 1.44],
    "radius_km": 50.0,
}


def test_match_rejects_missing_body(client):
    response = client.post("/match", json={})
    assert response.status_code == 422


def test_match_rejects_empty_skills(client):
    payload = {**BASE_PAYLOAD, "skills": []}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_blank_skill(client):
    payload = {**BASE_PAYLOAD, "skills": [""]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_negative_radius(client):
    payload = {**BASE_PAYLOAD, "radius_km": -1.0}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_zero_radius(client):
    payload = {**BASE_PAYLOAD, "radius_km": 0.0}
    response = client.post("/match", json=payload)
    assert response.status_code == 422


def test_match_rejects_out_of_bounds_location(client):
    payload = {**BASE_PAYLOAD, "location": [999.0, 999.0]}
    response = client.post("/match", json=payload)
    assert response.status_code == 422
