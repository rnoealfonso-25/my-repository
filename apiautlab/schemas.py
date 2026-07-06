from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class EquipoBase(BaseModel):
    descripcion: Annotated[str, Field(min_length=1, max_length=1000)]
    imagen: Annotated[str | None, Field(max_length=500)] = None


class EquipoCreate(EquipoBase):
    pass


class EquipoUpdate(BaseModel):
    descripcion: Annotated[str | None, Field(min_length=1, max_length=1000)] = None
    imagen: Annotated[str | None, Field(max_length=500)] = None


class EquipoRead(EquipoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
