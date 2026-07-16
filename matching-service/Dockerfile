# SH-2 — Image de production du matching-service (FastAPI).
FROM python:3.11-slim
WORKDIR /app

# Dépendances d'abord (couche mise en cache tant que requirements.txt ne change pas)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./
COPY app ./app

# Exécution non-root (durcissement, CLAUDE.md §8)
RUN useradd --create-home appuser
USER appuser

EXPOSE 8000
# /health existe depuis SH-11 : un conteneur « up » doit signifier « le service répond »
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=2)" || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
