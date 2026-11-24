"""Candidate API shared by the game backend and local collection app."""
import base64
import io
import json
from threading import BoundedSemaphore

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict
from starlette.concurrency import run_in_threadpool

from .detection import MAX_BYTES, detect, load_image
from .inference import classify_candidates
from .levels import reviewed_level
from .model_service import local_predictor

router = APIRouter()


@router.post('/api/sketch/candidates')
async def candidates(file: UploadFile = File(...), method: str = 'adaptive', min_area_ratio: float = Query(.00008, gt=0, lt=.1), classify: bool = True):
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'Image must be at most 5 MiB')
    try:
        image = load_image(data)
        boxes = detect(image, method=method, min_area_ratio=min_area_ratio)
        predictor, threshold, status = await run_in_threadpool(local_predictor) if classify and boxes else (None, .8, 'unavailable' if classify else 'disabled')
        result = await run_in_threadpool(classify_candidates, image, boxes, predictor=predictor, review_threshold=threshold)
        if predictor is None:
            result['model_status'] = status
        warnings = ['Every object needs your review before creating a level.']
        if predictor is None:
            warnings.append('No CNN was run. Choose labels manually.' if status in ('unavailable', 'disabled') else 'The local model could not be loaded. Check the server configuration; manual labeling is available.')
        if any(b.get('prediction_status') == 'invalid' for b in result['candidates']):
            warnings.append('Some model outputs were invalid. Label those objects manually.')
        if any(b.get('prediction_status') == 'not_run' for b in result['candidates']):
            warnings.append('Only the first 256 candidates were classified. Label the remaining boxes manually.')
        return {'image': {'width': image.width, 'height': image.height, 'coordinates': 'exif_oriented_pixels'},
                'stage': 'candidates', 'image_analyzed': True, **result, 'warnings': warnings}
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


@router.post('/api/sketch/preview')
async def oriented_preview(file: UploadFile = File(...)):
    """Return the same oriented pixels used by candidate detection."""
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'Image must be at most 5 MiB')
    try:
        image = load_image(data)
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        return {'width': image.width, 'height': image.height,
                'url': 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


_GENERATION_SLOTS = BoundedSemaphore(2)


@router.post('/api/sketch/generate')
async def automatic_game(file: UploadFile = File(...), corrections: str = Form('{}'), allow_repairs: bool = Form(True)):
    """Generate a candidate game with real inference and an explicit repair log."""
    try:
        data = await file.read(MAX_BYTES + 1)
    finally:
        await file.close()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, 'Image must be at most 5 MiB')
    try:
        selected = json.loads(corrections)
        if not isinstance(selected, dict) or len(selected) > 64 or any(not isinstance(k, str) or not isinstance(v, str) for k, v in selected.items()):
            raise ValueError('Invalid corrections')
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, str(exc)) from exc
    if not _GENERATION_SLOTS.acquire(blocking=False):
        raise HTTPException(429, 'Generation is busy. Please try again shortly.')
    try:
        from .automatic import generate
        def work():
            return generate(load_image(data), selected, allow_repairs)
        return await run_in_threadpool(work)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        _GENERATION_SLOTS.release()
