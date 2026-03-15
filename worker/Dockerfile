FROM python:3.11-slim

WORKDIR /app

# System dependencies for pikepdf/lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    libxml2 libxslt1.1 libqpdf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
