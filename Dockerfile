# syntax=docker/dockerfile:1.7

FROM node:22.22.1-bookworm-slim AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.11.12-slim-bookworm AS app-runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN groupadd --system --gid 10001 seekway-datahub \
    && useradd --system --uid 10001 --gid seekway-datahub \
        --home-dir /app --shell /usr/sbin/nologin seekway-datahub

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --requirement requirements.txt

COPY app/ ./app/
COPY backend/app/ ./backend/app/
COPY backend/migrations/ ./backend/migrations/
COPY backend/alembic.ini ./backend/alembic.ini
COPY config/ ./config/
COPY sql/ ./sql/
COPY --from=frontend-build /build/frontend/dist/ ./frontend/dist/

RUN mkdir -p /app/logs \
    && chown -R seekway-datahub:seekway-datahub /app/logs

USER seekway-datahub

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]


FROM nginx:1.28-alpine AS frontend-runtime

COPY config/docker/frontend-nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /build/frontend/dist/ /usr/share/nginx/html/

RUN chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080
