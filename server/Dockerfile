# Demo server (FastAPI wrapper over pce.Engine).
FROM python:3.11-slim
WORKDIR /app
COPY server/requirements.txt /tmp/req.txt
RUN pip install --no-cache-dir -r /tmp/req.txt
COPY pce ./pce
COPY server ./server
COPY bench ./bench
ENV PYTHONPATH=/app
ENV PCE_AUTOLOAD=/app/bench/samples/recurring_family.jsonl
EXPOSE 8000
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
