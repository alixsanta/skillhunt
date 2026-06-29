from sqlalchemy import Column, String
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class FreelanceDB(Base):
    """Projection lecture seule de la table 'users' du backend-core."""
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    role = Column(String, nullable=False)


class GearDB(Base):
    """Projection lecture seule de la table 'gear' du backend-core."""
    __tablename__ = "gear"

    id = Column(String, primary_key=True)
    freelanceId = Column("freelanceId", String, nullable=False)
    category = Column(String, nullable=False)
    status = Column(String, nullable=False)
