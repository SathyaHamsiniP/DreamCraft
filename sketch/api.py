"""Candidate API shared by the game backend and local collection app."""
from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict

from .detection import MAX_BYTES, detect, load_image
from .inference import classify_candidates
from .levels import reviewed_level

router = APIRouter()


@router.post('/api/sketch/candidates')
async def candidates(file: UploadFile = File(...), method: str = 'adaptive', min_area_ratio: float = Query(.00008, gt=0, lt=.1)):
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'Image must be at most 5 MiB')
    try:
        image = load_image(data)
        boxes = detect(image, method=method, min_area_ratio=min_area_ratio)
        return {'image': {'width': image.width, 'height': image.height, 'coordinates': 'exif_oriented_pixels'},
                'stage': 'candidates', 'image_analyzed': True, **classify_candidates(image, boxes),
                'warnings': ['Unclassified candidates need review. No CNN was run.']}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


class ReviewedObjects(BaseModel):
    model_config = ConfigDict(extra='forbid')
    image_width: int
    image_height: int
    world_width: float
    world_height: float
    objects: list[dict]


@router.post('/api/sketch/reviewed-level')
def build_level(body: ReviewedObjects):
    try:
        return {'level': reviewed_level(**body.model_dump()), 'playability_checked': False}
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
