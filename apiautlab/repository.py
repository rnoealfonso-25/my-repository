from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Equipo
from schemas import EquipoCreate, EquipoUpdate


def list_equipos(db: Session) -> list[Equipo]:
    return list(db.scalars(select(Equipo).order_by(Equipo.id)))


def get_equipo(db: Session, equipo_id: int) -> Equipo | None:
    return db.get(Equipo, equipo_id)


def create_equipo(db: Session, equipo_in: EquipoCreate) -> Equipo:
    equipo = Equipo(
        descripcion=equipo_in.descripcion.strip(),
        imagen=equipo_in.imagen.strip() if equipo_in.imagen else None,
    )
    db.add(equipo)
    db.commit()
    db.refresh(equipo)
    return equipo


def update_equipo(db: Session, equipo: Equipo, equipo_in: EquipoUpdate) -> Equipo:
    data = equipo_in.model_dump(exclude_unset=True)

    if "descripcion" in data and data["descripcion"] is not None:
        equipo.descripcion = data["descripcion"].strip()
    if "imagen" in data:
        equipo.imagen = data["imagen"].strip() if data["imagen"] else None

    db.commit()
    db.refresh(equipo)
    return equipo


def delete_equipo(db: Session, equipo: Equipo) -> None:
    db.delete(equipo)
    db.commit()
