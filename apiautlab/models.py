from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Equipo(Base):
    __tablename__ = "equipo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    imagen: Mapped[str | None] = mapped_column(String(500), nullable=True)
