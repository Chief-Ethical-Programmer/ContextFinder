FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir .
COPY app app
COPY alembic.ini .
COPY migrations migrations
COPY start.sh .
RUN sed -i 's/\r$//' start.sh && chmod +x start.sh
CMD ["sh", "./start.sh"]
