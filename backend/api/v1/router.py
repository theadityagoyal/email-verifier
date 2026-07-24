from fastapi import APIRouter
from api.v1.endpoints import verify, bulk, dashboard, admin, notifications, config

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(verify.router)
api_router.include_router(bulk.router)
api_router.include_router(dashboard.router)
api_router.include_router(admin.router)
api_router.include_router(notifications.router)
api_router.include_router(config.router)
