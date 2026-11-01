FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app app
COPY seed seed
COPY alembic.ini .
COPY migrations migrations
COPY start.sh .
RUN chmod +x start.sh
CMD ["./start.sh"]
