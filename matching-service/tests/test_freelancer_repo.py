# C2.2.2 — Tests du repository : mock AsyncSession pour valider la logique de mapping
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID
from app.services.freelancer_repo import get_candidates
from app.services.scoring import FreelancerProfile


def make_mock_db(rows: list[tuple]) -> AsyncMock:
    """Construit un mock AsyncSession retournant les rows données."""
    mock_result = MagicMock()
    mock_result.all.return_value = rows
    mock_db = AsyncMock()
    mock_db.execute.return_value = mock_result
    return mock_db


@pytest.mark.asyncio
async def test_get_candidates_empty_db():
    db = make_mock_db([])
    result = await get_candidates(db)
    assert result == []


@pytest.mark.asyncio
async def test_get_candidates_single_freelance_no_gear():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, None)])
    result = await get_candidates(db)
    assert len(result) == 1
    assert result[0].freelance_id == UUID(fid)
    assert result[0].gear_categories == []


@pytest.mark.asyncio
async def test_get_candidates_single_freelance_with_gear():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    db = make_mock_db([(fid, "DRONE"), (fid, "CAMERA_360")])
    result = await get_candidates(db)
    assert len(result) == 1
    assert set(result[0].gear_categories) == {"DRONE", "CAMERA_360"}


@pytest.mark.asyncio
async def test_get_candidates_multiple_freelances():
    fid1 = "123e4567-e89b-12d3-a456-426614174000"
    fid2 = "223e4567-e89b-12d3-a456-426614174001"
    db = make_mock_db([(fid1, "DRONE"), (fid2, "ROBOTICS"), (fid2, "SENSOR")])
    result = await get_candidates(db)
    assert len(result) == 2
    profiles = {str(p.freelance_id): p for p in result}
    assert profiles[fid1].gear_categories == ["DRONE"]
    assert set(profiles[fid2].gear_categories) == {"ROBOTICS", "SENSOR"}


@pytest.mark.asyncio
async def test_get_candidates_deduplicates_freelances():
    fid = "123e4567-e89b-12d3-a456-426614174000"
    # Même freelance apparaît 3 fois (3 items de gear)
    db = make_mock_db([(fid, "DRONE"), (fid, "DRONE"), (fid, "CAMERA_360")])
    result = await get_candidates(db)
    assert len(result) == 1
