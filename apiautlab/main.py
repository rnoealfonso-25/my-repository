from contextlib import asynccontextmanager
from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from config import settings
from database import create_tables, engine, get_db
import models  # noqa: F401 - registra los modelos en Base.metadata
import repository
from schemas import EquipoCreate, EquipoRead, EquipoUpdate

UPLOAD_DIR = Path(__file__).with_name("uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_tables()
    yield


app = FastAPI(title=settings.app_name, version="0.3.0", lifespan=lifespan)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def save_image_file(file: UploadFile) -> str:
    original_name = file.filename or "imagen"
    extension = Path(original_name).suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagen no permitido. Usa jpg, jpeg, png, webp o gif.",
        )

    safe_name = f"{uuid4().hex}{extension}"
    target = UPLOAD_DIR / safe_name

    with target.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return f"/uploads/{safe_name}"


@app.get("/")
def home():
    return {"message": "AutLab API conectada correctamente"}


@app.get("/health")
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo conectar con la base de datos.",
        ) from exc

    return {"status": "ok", "database": settings.db_name, "host": settings.db_host}


@app.get("/equipos", response_model=list[EquipoRead])
def listar_equipos(db: Session = Depends(get_db)):
    return repository.list_equipos(db)


@app.post("/equipos", response_model=EquipoRead, status_code=status.HTTP_201_CREATED)
def crear_equipo(equipo: EquipoCreate, db: Session = Depends(get_db)):
    return repository.create_equipo(db, equipo)


@app.post("/equipos/form", response_model=EquipoRead, status_code=status.HTTP_201_CREATED)
def crear_equipo_form(
    descripcion: str = Form(...),
    imagen_url: str | None = Form(None),
    imagen_archivo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    imagen = imagen_url.strip() if imagen_url else None

    if imagen_archivo and imagen_archivo.filename:
        imagen = save_image_file(imagen_archivo)

    equipo = EquipoCreate(descripcion=descripcion, imagen=imagen)
    return repository.create_equipo(db, equipo)


@app.post("/uploads/imagen")
def subir_imagen(imagen_archivo: UploadFile = File(...)):
    return {"imagen": save_image_file(imagen_archivo)}


@app.get("/equipos/{equipo_id}", response_model=EquipoRead)
def obtener_equipo(equipo_id: int, db: Session = Depends(get_db)):
    equipo = repository.get_equipo(db, equipo_id)
    if equipo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado.")
    return equipo


@app.put("/equipos/{equipo_id}", response_model=EquipoRead)
def actualizar_equipo(equipo_id: int, equipo_in: EquipoUpdate, db: Session = Depends(get_db)):
    equipo = repository.get_equipo(db, equipo_id)
    if equipo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado.")
    return repository.update_equipo(db, equipo, equipo_in)


@app.delete("/equipos/{equipo_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_equipo(equipo_id: int, db: Session = Depends(get_db)):
    equipo = repository.get_equipo(db, equipo_id)
    if equipo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipo no encontrado.")
    repository.delete_equipo(db, equipo)
