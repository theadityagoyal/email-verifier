from fastapi import APIRouter
from api.external.v1.endpoints import verify, bulk

# Separate prefix from the internal dashboard API (/api/v1) so we never
# collide with or accidentally affect the frontend's existing routes.
api_external_router = APIRouter(prefix="/api/external/v1")
api_external_router.include_router(verify.router)
api_external_router.include_router(bulk.router)