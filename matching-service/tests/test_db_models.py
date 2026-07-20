# C2.2.2 — Harnais de tests : vérification des modèles ORM (attributs, table names)
from app.db.models import FreelanceDB, GearDB


def test_freelance_db_tablename():
    assert FreelanceDB.__tablename__ == "users"


def test_freelance_db_columns():
    cols = {c.name for c in FreelanceDB.__table__.columns}
    assert "id" in cols
    assert "role" in cols


def test_gear_db_tablename():
    assert GearDB.__tablename__ == "gear"


def test_gear_db_columns():
    cols = {c.name for c in GearDB.__table__.columns}
    assert "id" in cols
    assert "freelanceId" in cols
    assert "category" in cols
    assert "status" in cols
