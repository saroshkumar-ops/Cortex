# Bench-only Dockerfile. Pure-stdlib pce/ package, no external deps.
# Judges run: docker build -t pce . && docker run --rm pce
FROM python:3.11-slim
WORKDIR /app
COPY pce ./pce
COPY bench ./bench
ENV PYTHONPATH=/app
CMD ["bash", "bench/run.sh"]
